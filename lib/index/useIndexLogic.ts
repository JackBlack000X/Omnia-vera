import { useHabits } from '@/lib/habits/Provider';
import { getHabitsAppearingOnDate } from '@/lib/habits/habitsForDate';
import { getDailyOccurrenceTotal, getOccurrenceDoneForDay } from '@/lib/habits/occurrences';
import type { Habit } from '@/lib/habits/schema';
import {
    DOMANI_TOMORROW_KEY,
    FOLDER_COLORS,
    FOLDER_ICONS,
    FolderBlockItem,
    FolderFilters,
    FolderItem,
    MultiDragBlockItem,
    OGGI_TODAY_KEY,
    SectionItem,
    SortModeType,
    TUTTE_KEY,
} from '@/lib/index/indexTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

type OverlapHoverState = {
  isOverlapping: boolean;
  activeIndex: number;
  direction: number;
};

const DEFAULT_OVERLAP_HOVER_STATE: OverlapHoverState = {
  isOverlapping: false,
  activeIndex: -1,
  direction: 0,
};

function hasSelectedFolderFilters(filters?: FolderFilters): boolean {
  return !!(filters?.tipos?.length || filters?.colors?.length || filters?.frequencies?.length);
}

function expandSelectedFolderFilters(filters: FolderFilters | undefined, habits: Habit[]): FolderFilters | undefined {
  if (!hasSelectedFolderFilters(filters)) return filters;

  const next: FolderFilters = { ...filters };

  if (filters?.tipos?.length) {
    const tipos = new Set(filters.tipos);
    for (const habit of habits) tipos.add(habit.tipo ?? 'task');
    next.tipos = Array.from(tipos);
  }

  if (filters?.colors?.length) {
    const colors = new Set(filters.colors);
    for (const habit of habits) {
      if (habit.color) colors.add(habit.color);
    }
    next.colors = Array.from(colors);
  }

  if (filters?.frequencies?.length) {
    const frequencies = new Set(filters.frequencies);
    for (const habit of habits) frequencies.add(habit.habitFreq ?? 'single');
    next.frequencies = Array.from(frequencies);
  }

  return next;
}

function cloneSelectedFolderFilters(filters: FolderFilters | undefined): FolderFilters | undefined {
  if (!filters) return undefined;

  return {
    tipos: filters.tipos ? [...filters.tipos] : undefined,
    colors: filters.colors ? [...filters.colors] : undefined,
    frequencies: filters.frequencies ? [...filters.frequencies] : undefined,
  };
}

function nextYmd(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function useIndexLogic() {
  const router = useRouter();
  const { habits, history, getDay, toggleDone, removeHabit, updateHabit, addHabit, reorder, updateHabitsOrder, updateHabitFolder, setHabits, resetToday, dayResetTime, setDayResetTime, resetStorage: providerResetStorage } = useHabits();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [closingMenuId, setClosingMenuId] = useState<string | null>(null);
  const [openMenuHabitId, setOpenMenuHabitId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortModeType>('creation');
  const [sortModeByFolder, setSortModeByFolder] = useState<Record<string, SortModeType>>({});
  const [oggiCustomOrder, setOggiCustomOrder] = useState<string[] | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>('__oggi__');
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [editFolderVisible, setEditFolderVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[3]);
  const [newFolderIcon, setNewFolderIcon] = useState(FOLDER_ICONS[0].name);
  const [newFolderFilters, setNewFolderFilters] = useState<FolderFilters>({});
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
  const lastMergeHoverTimeSV = useSharedValue(0);
  const mergeDirectionSV = useSharedValue(0); // last non-zero direction while merge indicator was active
  const [overlapHoverState, setOverlapHoverState] = useState<OverlapHoverState>(DEFAULT_OVERLAP_HOVER_STATE);
  const overlapHoverStateRef = useRef<OverlapHoverState>(DEFAULT_OVERLAP_HOVER_STATE);
  const [animVals, setAnimVals] = useState<unknown>(null);
  const folderTaskCountsSV = useSharedValue<number[]>([]);
  const folderHeightsSV = useSharedValue<number[]>([]);

  const [displayList, setDisplayList] = useState<SectionItem[] | null>(null);
  const [folderMergeResetVersion, setFolderMergeResetVersion] = useState(0);
  const [sectionOrder, setSectionOrder] = useState<(string | null)[] | null>(null);
  const [fadingOutFolderId, setFadingOutFolderId] = useState<string | null>(null);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionOrder, setSelectionOrder] = useState<string[]>([]);
  const selectionOrderRef = useRef<string[]>([]);
  const selectedIdsAtDragStartRef = useRef<Set<string>>(new Set());
  const selectionByFolderRef = useRef<Record<string, Set<string>>>({});
  const prevActiveFolderRef = useRef<string | null>(activeFolder);
  const [draggingSelectionCount, setDraggingSelectionCount] = useState(0);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const today = getDay(new Date());
  // Giorno di calendario in Zurich (può differire da today quando dayResetTime > 00:00 e siamo prima del reset)
  const calendarToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const tomorrow = useMemo(() => nextYmd(calendarToday), [calendarToday]);

  const prevSectionedListRef = useRef<SectionItem[]>([]);

  const habitVisualKey = useCallback((habit: Habit) => {
    const weeklyTimesKey = Object.entries(habit.schedule?.weeklyTimes ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([day, value]) => `${day}:${value?.start ?? ''}-${value?.end ?? ''}`)
      .join(';');
    const monthlyTimesKey = Object.entries(habit.schedule?.monthlyTimes ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([day, value]) => `${day}:${value?.start ?? ''}-${value?.end ?? ''}`)
      .join(';');
    const overridesKey = Object.entries(habit.timeOverrides ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => typeof value === 'string'
        ? `${day}:${value}`
        : `${day}:${value.start ?? ''}-${value.end ?? ''}`)
      .join(';');

    return [
      habit.id,
      habit.text,
      habit.folder ?? '',
      habit.color ?? '',
      habit.tipo ?? '',
      habit.habitFreq ?? '',
      habit.isAllDay ? '1' : '0',
      String(habit.dailyOccurrences ?? 1),
      String(habit.occurrenceGapMinutes ?? 360),
      habit.schedule?.time ?? '',
      habit.schedule?.endTime ?? '',
      (habit.schedule?.daysOfWeek ?? []).join('.'),
      (habit.schedule?.monthDays ?? []).join('.'),
      habit.schedule?.yearMonth ?? '',
      habit.schedule?.yearDay ?? '',
      weeklyTimesKey,
      monthlyTimesKey,
      overridesKey,
    ].join('|');
  }, []);

  const sectionedListVisualKey = useCallback((list: SectionItem[]) => {
    return list.map((item) => {
      if (item.type === 'folderBlock') {
        return `f-${item.folderId}-${item.tasks.map(habitVisualKey).join('||')}`;
      }
      if (item.type === 'multiDragBlock') {
        return `m-${item.habits.map(habitVisualKey).join('||')}`;
      }
      return `t-${habitVisualKey(item.habit)}`;
    }).join(',');
  }, [habitVisualKey]);

  const updateFoldersScrollEnabled = useCallback(() => {
    const cw = foldersContentWidthRef.current;
    const tw = foldersContainerWidthRef.current;
    setFoldersScrollEnabled(tw > 0 && cw > tw);
  }, []);

  const selectionKeyForFolder = useCallback(
    (folder: string | null) => (folder === null ? TUTTE_KEY : folder),
    []
  );

  useEffect(() => {
    return () => {
      if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
    };
  }, []);

  // Persist selection separately per folder so switching tabs (Oggi / Tutte / cartelle custom)
  // non copia la selezione nella nuova cartella ma la salva su quella precedente.
  useEffect(() => {
    const prevKey = selectionKeyForFolder(prevActiveFolderRef.current);
    selectionByFolderRef.current[prevKey] = new Set(selectedIds);
    prevActiveFolderRef.current = activeFolder;
  }, [activeFolder, selectedIds, selectionKeyForFolder]);

  // Quando cambi cartella in modalità selezione, ripristina SOLO la selezione
  // salvata per quella cartella (altrimenti in "Tutte" vedi tutto deselezionato).
  useEffect(() => {
    if (!selectionMode) return;
    const key = selectionKeyForFolder(activeFolder);
    const saved = selectionByFolderRef.current[key];
    setSelectedIds(saved ? new Set(saved) : new Set());
  }, [activeFolder, selectionMode, selectionKeyForFolder]);

  // Quando esci dalla modalità selezione ("annullo"), azzera completamente
  // lo stato di selezione corrente e salvata per la cartella attiva, così
  // la prossima volta che riattivi la selezione parti da zero e l'anchor
  // viene calcolato solo in base alle nuove scelte.
  useEffect(() => {
    selectionOrderRef.current = selectionOrder;
  }, [selectionOrder]);

  useEffect(() => {
    if (selectionMode) return;
    setSelectionOrder([]);
    selectedIdsAtDragStartRef.current = new Set();
    const key = selectionKeyForFolder(activeFolder);
    selectionByFolderRef.current[key] = new Set();
  }, [selectionMode, activeFolder, selectionKeyForFolder]);

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

  const toggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleAddFolder = useCallback(() => {
    setNewFolderName('');
    setNewFolderColor(FOLDER_COLORS[3]);
    setNewFolderIcon(FOLDER_ICONS[0].name);
    setNewFolderFilters({});
    setCreateFolderVisible(true);
  }, []);

  const resetStorage = useCallback(async () => {
    await providerResetStorage();
    setFolders([]);
    setSectionOrder(null);
    setSortMode('creation');
    setSortModeByFolder({});
    setActiveFolder('__oggi__');
  }, [providerResetStorage]);

  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;
    const cleanFilters: FolderFilters | undefined =
      (newFolderFilters.tipos?.length || newFolderFilters.colors?.length || newFolderFilters.frequencies?.length)
        ? newFolderFilters : undefined;
    const newFolder: FolderItem = { id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name, color: newFolderColor, icon: newFolderIcon, filters: cleanFilters };
    addFolderAndPersist(newFolder);
    setActiveFolder(name);
    setCreateFolderVisible(false);
  }, [newFolderName, newFolderColor, newFolderIcon, newFolderFilters, addFolderAndPersist]);

  const handleSaveEditFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name || !editingFolder) return;
    const oldName = editingFolder.name.trim();
    setFolders(prev => {
      const cleanFilters: FolderFilters | undefined =
        (newFolderFilters.tipos?.length || newFolderFilters.colors?.length || newFolderFilters.frequencies?.length)
          ? newFolderFilters : undefined;
      const next = prev.map(f => f.name.trim() === oldName ? { ...f, name, color: newFolderColor, icon: newFolderIcon, filters: cleanFilters } : f);
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
  }, [newFolderName, newFolderColor, newFolderIcon, newFolderFilters, editingFolder, activeFolder, setHabits]);

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
    setNewFolderFilters(folder.filters ?? {});
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

  // Per la tab "Oggi" manteniamo un ordine custom indipendente da "Tutte".
  useEffect(() => {
    AsyncStorage.getItem('tasks_oggi_custom_order_v1').then((data) => {
      if (!data) return;
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
          setOggiCustomOrder(parsed as string[]);
        }
      } catch { }
    }).catch(() => { });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('tasks_sort_mode_v1', sortMode).catch(() => { });
  }, [sortMode]);
  useEffect(() => {
    AsyncStorage.setItem('tasks_sort_mode_per_folder_v1', JSON.stringify(sortModeByFolder)).catch(() => { });
  }, [sortModeByFolder]);
  useEffect(() => {
    if (!oggiCustomOrder) return;
    AsyncStorage.setItem('tasks_oggi_custom_order_v1', JSON.stringify(oggiCustomOrder)).catch(() => { });
  }, [oggiCustomOrder]);

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

  const handleMenuOpen = useCallback((h: Habit) => {
    setOpenMenuHabitId(prev => {
      if (prev && prev !== h.id) {
        setClosingMenuId(prev);
      }
      return h.id;
    });
  }, []);

  const handleMenuClose = useCallback((h: Habit) => {
    setOpenMenuHabitId(prev => prev === h.id ? null : prev);
  }, []);

  const toggleSelect = useCallback((habit: Habit) => {
    // NOTE: Do NOT use LayoutAnimation.configureNext here.
    // It animates native frames gradually, which causes DraggableFlatList's
    // cellDataRef to receive intermediate (too-small) heights for the
    // multiDragBlock cell during the animation. If drag starts before the
    // animation ends, activeCellSize is wrong → items below the block don't
    // shift. Reanimated's layout={Layout} on each rendered item already
    // handles smooth visual transitions without this problem.
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(habit.id)) next.delete(habit.id);
      else next.add(habit.id);
      return next;
    });
    setSelectionOrder(prev => {
      const exists = prev.includes(habit.id);
      if (exists) {
        return prev.filter(id => id !== habit.id);
      }
      return [...prev, habit.id];
    });
  }, []);

  const todayWeekday = useMemo(() => new Date().getDay(), [today]);
  const todayDayOfMonth = useMemo(() => new Date().getDate(), [today]);
  const todayMonthIndex = useMemo(() => new Date().getMonth() + 1, [today]);

  const habitsAppearingToday = useMemo(() => {
    return habits.filter((h) => {
      const hasOverrideForToday =
        !!h.timeOverrides?.[today] ||
        (today !== calendarToday && !!h.timeOverrides?.[calendarToday]);
      if (h.createdAt && today < h.createdAt && calendarToday < h.createdAt && !hasOverrideForToday) return false;
      const repeatStartDate = h.schedule?.repeatStartDate;
      if (repeatStartDate && today < repeatStartDate && calendarToday < repeatStartDate && !hasOverrideForToday) return false;
      const repeatEndDate = h.schedule?.repeatEndDate;
      if (repeatEndDate && today > repeatEndDate && calendarToday > repeatEndDate && !hasOverrideForToday) return false;
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
  }, [habits, today, calendarToday, todayWeekday, todayDayOfMonth, todayMonthIndex]);

  const stats = useMemo(() => {
    const todayHabits = habitsAppearingToday;
    const total = todayHabits.length;
    const dayEntry = history[today];
    let done = 0;
    for (const h of todayHabits) {
      const n = getDailyOccurrenceTotal(h);
      const k = getOccurrenceDoneForDay(dayEntry, h);
      done += n > 1 ? k / n : (k >= 1 ? 1 : 0);
    }
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done: Math.round(done), pct };
  }, [habitsAppearingToday, history, today]);

  const applyFolderFilters = useCallback((list: Habit[], filters: FolderFilters | undefined): Habit[] => {
    if (!filters) return list;
    let result = list;
    if (filters.tipos?.length) {
      result = result.filter(h => filters.tipos!.includes(h.tipo ?? 'task'));
    }
    if (filters.colors?.length) {
      result = result.filter(h => h.color && filters.colors!.includes(h.color));
    }
    if (filters.frequencies?.length) {
      result = result.filter(h => filters.frequencies!.includes(h.habitFreq ?? 'single'));
    }
    return result;
  }, []);

  const effectiveSortMode: SortModeType =
    activeFolder === null
      ? sortMode
      : activeFolder === OGGI_TODAY_KEY
        ? (sortModeByFolder[OGGI_TODAY_KEY] ?? sortMode)
        : activeFolder === DOMANI_TOMORROW_KEY
          ? (sortModeByFolder[DOMANI_TOMORROW_KEY] ?? sortMode)
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
      const referenceYmd = activeFolder === DOMANI_TOMORROW_KEY ? tomorrow : today;
      const getStartTime = (h: Habit) => {
        const override = h.timeOverrides?.[referenceYmd];
        const isAllDayMarker = override === '00:00';
        if (isAllDayMarker || h.isAllDay) return -1;
        const overrideStart = !isAllDayMarker && typeof override === 'string' ? override : (!isAllDayMarker ? override?.start : undefined);
        if (overrideStart) {
          const [hh, mm] = overrideStart.split(':').map(Number);
          return hh * 60 + mm;
        }
        const dateObj = new Date(referenceYmd + 'T12:00:00.000Z');
        const weekday = dateObj.getUTCDay();
        const dayOfMonth = dateObj.getUTCDate();
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
  }, [activeFolder, today, tomorrow]);

  const sortHabitsList = useCallback(
    (list: Habit[]) => sortHabitsWithMode(list, effectiveSortMode),
    [sortHabitsWithMode, effectiveSortMode]
  );

  // Single habits completed in a previous reset cycle — hidden from tasks tab after reset,
  // but kept in the database so oggi can still show them for past days.
  const singleHabitsHiddenAfterReset = useMemo(() => {
    const set = new Set<string>();
    for (const [day, entry] of Object.entries(history)) {
      if (day >= today) continue; // only check days before the current cycle
      for (const [id, done] of Object.entries(entry.completedByHabitId)) {
        if (!done) continue;
        const habit = habits.find(h => h.id === id);
        if (!habit) continue;
        const isSingle =
          habit.habitFreq === 'single' ||
          (!habit.habitFreq &&
            (Object.keys(habit.timeOverrides ?? {}).length > 0) &&
            (habit.schedule?.daysOfWeek?.length ?? 0) === 0 &&
            !habit.schedule?.monthDays?.length &&
            !habit.schedule?.yearMonth);
        if (isSingle) set.add(id);
      }
    }
    return set;
  }, [history, habits, today]);

  const habitsAppearingTomorrow = useMemo(() => {
    return getHabitsAppearingOnDate(habits, tomorrow, dayResetTime).filter(
      h => !singleHabitsHiddenAfterReset.has(h.id)
    );
  }, [habits, tomorrow, dayResetTime, singleHabitsHiddenAfterReset]);

  const sortedHabits = useMemo(() => {
    let list: Habit[];
    if (activeFolder === OGGI_TODAY_KEY) {
      list = habitsAppearingToday.filter(h => !singleHabitsHiddenAfterReset.has(h.id));

      // Se in "Oggi" siamo in ordine personalizzato, usiamo l'ordine locale
      // invece del campo globale `order`, così gli spostamenti qui non
      // influenzano la vista "Tutte".
      if (effectiveSortMode === 'custom' && oggiCustomOrder && oggiCustomOrder.length) {
        const idToIndex = new Map<string, number>();
        oggiCustomOrder.forEach((id, idx) => idToIndex.set(id, idx));
        return [...list].sort((a, b) => {
          const ia = idToIndex.get(a.id);
          const ib = idToIndex.get(b.id);
          if (ia != null && ib != null) return ia - ib;
          if (ia != null) return -1;
          if (ib != null) return 1;
          // fallback sul vecchio ordinamento
          return (a.order ?? 0) - (b.order ?? 0);
        });
      }
    } else if (activeFolder === DOMANI_TOMORROW_KEY) {
      list = habitsAppearingTomorrow;
    } else if (activeFolder) {
      const target = activeFolder.trim();
      const folderDef = folders.find(f => (f.name ?? '').trim() === target);
      const hasFilters = folderDef?.filters && (folderDef.filters.tipos?.length || folderDef.filters.colors?.length || folderDef.filters.frequencies?.length);
      if (hasFilters) {
        // Filtered folder: show all habits matching filters (not just ones assigned to this folder)
        list = applyFolderFilters(
          habits.filter(h => !singleHabitsHiddenAfterReset.has(h.id)),
          folderDef!.filters
        );
      } else {
        list = habits.filter(h => (h.folder ?? '').trim() === target && !singleHabitsHiddenAfterReset.has(h.id));
      }
    } else {
      list = habits.filter(h => !singleHabitsHiddenAfterReset.has(h.id));
    }
    return sortHabitsList(list);
  }, [habits, habitsAppearingToday, habitsAppearingTomorrow, sortMode, today, activeFolder, folders, applyFolderFilters, sortHabitsList, singleHabitsHiddenAfterReset, effectiveSortMode, oggiCustomOrder]);

  const sectionedList = useMemo((): SectionItem[] => {
    const isOggiView = activeFolder === OGGI_TODAY_KEY;
    const isDomaniView = activeFolder === DOMANI_TOMORROW_KEY;
    const isFolderStructureView =
      (activeFolder === null || isOggiView || isDomaniView) && effectiveSortMode === 'folder';

    if (!isFolderStructureView) {
      return sortedHabits.map(h => ({ type: 'task' as const, habit: h }));
    }

    const sourceHabits = isOggiView
      ? habitsAppearingToday.filter(h => !singleHabitsHiddenAfterReset.has(h.id))
      : isDomaniView
        ? habitsAppearingTomorrow
      : habits.filter(h => !singleHabitsHiddenAfterReset.has(h.id));
    const folderEntries = folders
      .map(f => ({ name: (f.name ?? '').trim(), folder: f }))
      .filter((entry): entry is { name: string; folder: typeof folders[number] } => !!entry.name);
    const folderNames = new Set(folderEntries.map(entry => entry.name));
    const folderMap = new Map(folderEntries.map(entry => [entry.name, entry.folder]));
    const hasActiveFilters = (folderName: string | null) => {
      if (folderName == null) return false;
      const filters = folderMap.get(folderName)?.filters;
      return !!(filters?.tipos?.length || filters?.colors?.length || filters?.frequencies?.length);
    };
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
      resolvedOrder = [null, ...folderEntries.map(entry => entry.name)];
    }
    if (resolvedOrder.length === 0) {
      resolvedOrder = [null, ...folderEntries.map(entry => entry.name)];
    }
    const byFolder = new Map<string | null, Habit[]>();
    const assignedHabitIds = new Set<string>();

    for (const h of sourceHabits) {
      const explicitFolder = (h.folder ?? '').trim();
      if (!explicitFolder || hasActiveFilters(explicitFolder) || !folderNames.has(explicitFolder)) continue;
      const existing = byFolder.get(explicitFolder) ?? [];
      existing.push(h);
      byFolder.set(explicitFolder, existing);
      assignedHabitIds.add(h.id);
    }

    for (const folderName of resolvedOrder) {
      if (folderName == null || !hasActiveFilters(folderName)) continue;
      const folderDef = folderMap.get(folderName);
      const matching = applyFolderFilters(
        sourceHabits.filter(h => !assignedHabitIds.has(h.id)),
        folderDef?.filters
      );
      if (matching.length > 0) {
        byFolder.set(folderName, matching);
        for (const h of matching) assignedHabitIds.add(h.id);
      }
    }

    byFolder.set(
      null,
      sourceHabits.filter(h => !assignedHabitIds.has(h.id))
    );

    const out: SectionItem[] = [];
    const orderList = [...resolvedOrder];
    for (let i = 0; i < orderList.length; i++) {
      const folderName = orderList[i];
      const tasks = byFolder.get(folderName) ?? [];
      if ((isOggiView || isDomaniView) && tasks.length === 0) continue;
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
            prev.tasks.every((t, idx) => t === newItem.tasks[idx]);
          if (tasksMatch && prev.folderName === newItem.folderName) return prev;
        }
        if (prev.type === 'task' && newItem.type === 'task') {
          if (prev.habit === newItem.habit) return prev;
        }
      }
      return newItem;
    });

    prevSectionedListRef.current = finalized;
    return finalized;
  }, [habits, habitsAppearingToday, habitsAppearingTomorrow, folders, activeFolder, sortMode, sortModeByFolder, sortedHabits, sortHabitsWithMode, sectionOrder, singleHabitsHiddenAfterReset]);

  useEffect(() => {
    // Keep the UI thread synchronously updated with which active indices correspond to empty/collapsed folders
    folderTaskCountsSV.value = sectionedList.map(x => 
      x.type === 'folderBlock' ? (collapsedFolderIds.has(x.folderId) ? 0 : x.tasks.length) : -1
    );

    const nextVisualKey = sectionedListVisualKey(sectionedList);
    const displayVisualKey = displayList ? sectionedListVisualKey(displayList) : null;

    if (displayList === null) {
      setDisplayList(sectionedList);
      return;
    }
    if (isPostDragRef.current) {
      if (displayVisualKey === nextVisualKey) {
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
    // Sync only when the rendered content really changed. A pure ref swap right
    // after drag convergence causes the intermittent flicker seen in Tasks.
    if (displayVisualKey !== nextVisualKey) {
      pendingDisplayRef.current = null;
      setDisplayList(sectionedList);
    }
  }, [sectionedList, displayList, sectionedListVisualKey, collapsedFolderIds]);

  const completedByHabitId = useMemo(
    () => history[today]?.completedByHabitId ?? {},
    [history, today]
  );

  const isFolderModeWithSections =
    (activeFolder === null || activeFolder === OGGI_TODAY_KEY || activeFolder === DOMANI_TOMORROW_KEY) && effectiveSortMode === 'folder';

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
    return [OGGI_TODAY_KEY, DOMANI_TOMORROW_KEY, ...base];
  }, [sectionOrder, folders]);

  const commitDragEnd = useCallback(() => {
    isMergeHoverSV.value = false;
    overlapHoverStateRef.current = DEFAULT_OVERLAP_HOVER_STATE;
    setOverlapHoverState(DEFAULT_OVERLAP_HOVER_STATE);
  }, [isMergeHoverSV]);
  commitDragEndRef.current = commitDragEnd;

  const updateOverlapHoverState = useCallback((next: OverlapHoverState) => {
    overlapHoverStateRef.current = next;
    setOverlapHoverState(next);
  }, []);

  const getFolderBlockFromHeaderIndex = useCallback((list: SectionItem[], headerIdx: number) => {
    const header = list[headerIdx];
    if (header?.type !== 'folderBlock') return null;
    const block: SectionItem[] = [header];
    let i = headerIdx + 1;
    // No merge zone or task group items in the new SectionItem structure
    return { block, endIndex: i };
  }, []);

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

  const recordDragStartSelection = useCallback((ids: Set<string>) => {
    selectedIdsAtDragStartRef.current = new Set(ids);
    setDraggingSelectionCount(ids.size);
  }, []);

  const buildCollapsedListIfMultiSelect = useCallback((list: SectionItem[], selectedIds: Set<string>): SectionItem[] => {
    if (selectedIds.size <= 1 || !list.length || list.some((x) => x.type !== 'task')) return list;

    // Collect indices and habits for all selected tasks
    const indices: number[] = [];
    const selectedInfos: { index: number; habit: Habit }[] = [];
    list.forEach((item, index) => {
      if (item.type === 'task' && selectedIds.has(item.habit.id)) {
        indices.push(index);
        selectedInfos.push({ index, habit: item.habit });
      }
    });
    if (!indices.length) return list;

    const first = Math.min(...indices);
    const last = Math.max(...indices);

    // Decide anchor: first selected id in selection order that is still selected
    const activeOrder = selectionOrder.filter(id => selectedIds.has(id));
    const anchorId = activeOrder[0] ?? selectedInfos[0].habit.id;
    const anchorInfo = selectedInfos.find(info => info.habit.id === anchorId) ?? selectedInfos[0];
    const anchorIndex = anchorInfo.index;

    // Non-selected items between first and last stay fuori dal blocco (middle),
    // items before "first" and after "last" restano fuori come before/after.
    const before = list.slice(0, first);
    const middle = list.slice(first + 1, last).filter(
      (item) => item.type === 'task' && !selectedIds.has(item.habit.id)
    );
    const after = list.slice(last + 1);

    // Internal order of the block:
    // - anchor stays as reference
    // - each later selection:
    //   - if it was above anchor → moves towards the top border of the block
    //   - if it was below anchor → moves towards the bottom border of the block
    let blockHabits: Habit[] = [anchorInfo.habit];

    activeOrder.slice(1).forEach(id => {
      const info = selectedInfos.find(si => si.habit.id === id);
      if (!info || info.habit.id === anchorInfo.habit.id) return;
      if (info.index < anchorIndex) {
        blockHabits = [info.habit, ...blockHabits];
      } else if (info.index > anchorIndex) {
        blockHabits = [...blockHabits, info.habit];
      }
    });

    // Ensure any selected not in activeOrder (e.g. legacy selections) are still included,
    // keeping their relative position around the anchor.
    selectedInfos.forEach(info => {
      if (blockHabits.some(h => h.id === info.habit.id)) return;
      if (info.index < anchorIndex) {
        blockHabits = [info.habit, ...blockHabits];
      } else if (info.index > anchorIndex) {
        blockHabits = [...blockHabits, info.habit];
      }
    });

    const block: MultiDragBlockItem = { type: 'multiDragBlock', habits: blockHabits };
    return [...before, block, ...middle, ...after];
  }, [selectionOrder]);

  const handleSectionedDragEnd = useCallback(({ data, from, to }: { data: SectionItem[]; from: number; to: number }) => {
    setDraggingSelectionCount(0);
    const snapshot = preDragSnapshotRef.current;
    const draggedItem = snapshot ? snapshot[from] : null;

    const hasMultiDragBlock = data.some((x) => x.type === 'multiDragBlock');
    const isOggiSimpleList = activeFolder === OGGI_TODAY_KEY && !isFolderModeWithSections;

    // Caso speciale: tab "Oggi" (lista semplice, non per cartelle).
    // Qui vogliamo che lo spostamento delle task sia LOCALE a "Oggi"
    // e non cambi l'ordine globale usato da "Tutte".
    if (isOggiSimpleList) {
      if (from === to && !isMergeHoverAtReleaseRef.current) {
        if (hasMultiDragBlock) {
          const taskItems = data.flatMap((x): Habit[] =>
            x.type === 'task' ? [x.habit] : x.type === 'multiDragBlock' ? x.habits : []
          );
          const expanded: SectionItem[] = taskItems.map(h => ({ type: 'task' as const, habit: h }));
          pendingDisplayRef.current = expanded;
          setDisplayList(expanded);
        }
        commitDragEnd();
        return;
      }

      let taskItems = data.flatMap((x): Habit[] =>
        x.type === 'task' ? [x.habit] : x.type === 'multiDragBlock' ? x.habits : []
      );

      // Ricostruiamo il blocco multi-drag come nel path non-Oggi: la libreria
      // sposta solo la cella ancora, le altre task selezionate restano alle
      // loro posizioni originali in data. Usiamo lo snapshot pre-drag per
      // determinare l'ordine interno del blocco e poi inseriamo tutto a `to`.
      const selectedSet = selectedIdsAtDragStartRef.current;
      if (selectedSet.size > 1 && draggedItem && draggedItem.type === 'task') {
        const baseList: Habit[] = (snapshot ?? data).flatMap((x): Habit[] =>
          x.type === 'task' ? [x.habit] : []
        );
        const selectedInfos: { index: number; habit: Habit }[] = [];
        baseList.forEach((h, index) => {
          if (selectedSet.has(h.id)) selectedInfos.push({ index, habit: h });
        });
        if (selectedInfos.length > 0) {
          const activeOrder = selectionOrderRef.current.filter(id => selectedSet.has(id));
          const anchorId = activeOrder[0] ?? selectedInfos[0].habit.id;
          const anchorInfo = selectedInfos.find(info => info.habit.id === anchorId) ?? selectedInfos[0];
          const anchorIndex = anchorInfo.index;
          let blockHabits: Habit[] = [anchorInfo.habit];
          activeOrder.slice(1).forEach(id => {
            const info = selectedInfos.find(si => si.habit.id === id);
            if (!info || info.habit.id === anchorInfo.habit.id) return;
            if (info.index < anchorIndex) blockHabits = [info.habit, ...blockHabits];
            else if (info.index > anchorIndex) blockHabits = [...blockHabits, info.habit];
          });
          selectedInfos.forEach(info => {
            if (blockHabits.some(h => h.id === info.habit.id)) return;
            if (info.index < anchorIndex) blockHabits = [info.habit, ...blockHabits];
            else if (info.index > anchorIndex) blockHabits = [...blockHabits, info.habit];
          });
          const before = taskItems.slice(0, to).filter(h => !selectedSet.has(h.id));
          const after = taskItems.slice(to).filter(h => !selectedSet.has(h.id));
          taskItems = [...before, ...blockHabits, ...after];
          selectedIdsAtDragStartRef.current = new Set();
        }
      }

      const newData: SectionItem[] = taskItems.map(h => ({ type: 'task' as const, habit: h }));
      pendingDisplayRef.current = newData;
      setDisplayList(newData);
      isPostDragRef.current = true;

      // Salviamo subito l'ordine locale per "Oggi" (nessun ritardo)
      setOggiCustomOrder(taskItems.map(h => h.id));

      const runUpdates = () => {
        setSortModeByFolder(prev => ({ ...prev, [OGGI_TODAY_KEY]: 'custom' }));
        if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
        dragEndTimeoutRef.current = setTimeout(() => {
          isPostDragRef.current = false;
          pendingDisplayRef.current = null;
          preDragSnapshotRef.current = null;
          commitDragEnd();
        }, 2000);
      };
      if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
      runUpdates();
      return;
    }

    if (from === to && !isMergeHoverAtReleaseRef.current) {
      if (hasMultiDragBlock) {
        const taskItems = data.flatMap((x): Habit[] =>
          x.type === 'folderBlock' ? x.tasks : x.type === 'task' ? [x.habit] : x.type === 'multiDragBlock' ? x.habits : []
        );
        const expanded: SectionItem[] = taskItems.map(h => ({ type: 'task' as const, habit: h }));
        pendingDisplayRef.current = expanded;
        setDisplayList(expanded);
      }
      commitDragEnd();
      return;
    }

    if (hasMultiDragBlock) {
      const taskItems = data.flatMap((x): Habit[] =>
        x.type === 'folderBlock' ? x.tasks : x.type === 'task' ? [x.habit] : x.type === 'multiDragBlock' ? x.habits : []
      );
      selectedIdsAtDragStartRef.current = new Set();
      const newData: SectionItem[] = taskItems.map(h => ({ type: 'task' as const, habit: h }));
      pendingDisplayRef.current = newData;
      setDisplayList(newData);
      isPostDragRef.current = true;
      const runUpdates = () => {
        updateHabitsOrder(taskItems);
        if (activeFolder != null) setSortModeByFolder(prev => ({ ...prev, [activeFolder.trim()]: 'custom' }));
        else setSortMode('custom');
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

    if (!draggedItem || draggedItem.type !== 'folderBlock') {
      // It's a task drag (no collapsed block)
      let taskItems = data.flatMap((x): Habit[] =>
        x.type === 'folderBlock' ? x.tasks : x.type === 'task' ? [x.habit] : []
      );
      const selectedSet = selectedIdsAtDragStartRef.current;

      if (selectedSet.size > 1 && (!draggedItem || draggedItem.type === 'task')) {
        // Ricostruiamo il blocco multi‑drag usando la disposizione
        // PRIMA del drag (snapshot), così l'ordine interno del blocco
        // dopo il drop rimane esattamente quello che avevi in selezione.
        const baseList: Habit[] = (snapshot ?? data).flatMap((x): Habit[] =>
          x.type === 'folderBlock' ? x.tasks : x.type === 'task' ? [x.habit] : []
        );

        const selectedInfos: { index: number; habit: Habit }[] = [];
        baseList.forEach((h, index) => {
          if (selectedSet.has(h.id)) {
            selectedInfos.push({ index, habit: h });
          }
        });

        if (selectedInfos.length > 0) {
          const activeOrder = selectionOrderRef.current.filter(id => selectedSet.has(id));
          const anchorId = activeOrder[0] ?? selectedInfos[0].habit.id;
          const anchorInfo = selectedInfos.find(info => info.habit.id === anchorId) ?? selectedInfos[0];
          const anchorIndex = anchorInfo.index;

          let blockHabits: Habit[] = [anchorInfo.habit];

          activeOrder.slice(1).forEach(id => {
            const info = selectedInfos.find(si => si.habit.id === id);
            if (!info || info.habit.id === anchorInfo.habit.id) return;
            if (info.index < anchorIndex) {
              blockHabits = [info.habit, ...blockHabits];
            } else if (info.index > anchorIndex) {
              blockHabits = [...blockHabits, info.habit];
            }
          });

          // Qualsiasi selezionata non presente in activeOrder viene comunque
          // inclusa, mantenendo lato sopra/sotto rispetto all'anchor.
          selectedInfos.forEach(info => {
            if (blockHabits.some(h => h.id === info.habit.id)) return;
            if (info.index < anchorIndex) {
              blockHabits = [info.habit, ...blockHabits];
            } else if (info.index > anchorIndex) {
              blockHabits = [...blockHabits, info.habit];
            }
          });

          const before = taskItems.slice(0, to).filter(h => !selectedSet.has(h.id));
          const after = taskItems.slice(to).filter(h => !selectedSet.has(h.id));
          taskItems = [...before, ...blockHabits, ...after];
          selectedIdsAtDragStartRef.current = new Set();
        }
      }

      const newData: SectionItem[] = taskItems.map(h => ({ type: 'task' as const, habit: h }));
      pendingDisplayRef.current = newData;
      setDisplayList(newData);
      isPostDragRef.current = true;
      const runUpdates = () => {
        updateHabitsOrder(taskItems);
        if (activeFolder != null) setSortModeByFolder(prev => ({ ...prev, [activeFolder.trim()]: 'custom' }));
        else setSortMode('custom');
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

    const applyFolderReorder = (nextData: SectionItem[]) => {
      const folderItems = nextData.filter((x): x is FolderBlockItem => x.type === 'folderBlock');
      isPostDragRef.current = true;
      const folderOrder = folderItems.map(f => f.folderName);
      setSectionOrder(folderOrder);
      AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(folderOrder.map(n => n === null ? TUTTE_KEY : n))).catch(() => { });

      pendingDisplayRef.current = nextData;
      setDisplayList(nextData);

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
    };

    // FOLDER DRAG LOGIC
    // Determine if we dropped inside the hover radius
    if (isMergeHoverAtReleaseRef.current && snapshot) {
      let actualTarget: FolderBlockItem | null = null;

      // If a list reorder actually registered under the hood before drop
      if (from !== to && snapshot) {
        const direction = dragDirectionAtReleaseRef.current;
        // Primary: item one step beyond the drop position in the hover direction.
        // In any linear drag from→to, items between to and from shift by one slot.
        // The item at to+direction was never in the displaced range, so snapshot[to+direction]
        // is always the intended merge target.
        const primaryIdx = to + direction;
        if (primaryIdx >= 0 && primaryIdx < snapshot.length) {
          const candidate = snapshot[primaryIdx];
          if (candidate && candidate.type === 'folderBlock' &&
            candidate.folderId !== (draggedItem as FolderBlockItem).folderId) {
            actualTarget = candidate as FolderBlockItem;
          }
        }
        // Secondary fallback: displaced folder at `to` (covers edge case to=0, direction=-1
        // where primaryIdx would be -1 and out of bounds).
        if (!actualTarget) {
          const displaced = snapshot[to];
          if (displaced && displaced.type === 'folderBlock' &&
            displaced.folderId !== (draggedItem as FolderBlockItem).folderId) {
            actualTarget = displaced as FolderBlockItem;
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
          Alert.alert(
            'Aggiungi task',
            `Vuoi aggiungere le task di "${sourceLabel}" in "${targetLabel}"?`,
            [
              {
                text: 'No', style: 'cancel', onPress: () => {
                  if (from !== to) {
                    applyFolderReorder(data);
                    return;
                  }
                  pendingDisplayRef.current = null;
                  setDisplayList(snapshot);
                  isPostDragRef.current = false;
                  preDragSnapshotRef.current = null;
                  commitDragEnd();
                }
              },
              {
                text: 'Sì', onPress: () => {
                  const sourceFolderName = (draggedItem as FolderBlockItem).folderName;
                  const targetFolderName = actualTarget!.folderName;
                  const sourceFolderDef = typeof sourceFolderName === 'string'
                    ? folders.find(f => (f.name ?? '').trim() === sourceFolderName.trim())
                    : undefined;
                  const targetFolderDef = typeof targetFolderName === 'string'
                    ? folders.find(f => (f.name ?? '').trim() === targetFolderName.trim())
                    : undefined;
                  const sourceHadFilters = hasSelectedFolderFilters(sourceFolderDef?.filters);
                  const targetHadFilters = hasSelectedFolderFilters(targetFolderDef?.filters);
                  const targetWasEmpty = actualTarget!.tasks.length === 0;
                  const targetFolder = actualTarget!.folderName === null ? undefined : (actualTarget!.folderName as string);
                  sourceTasks.forEach(h => updateHabitFolder(h.id, targetFolder));

                  if (sourceHadFilters || targetHadFilters) {
                    setFolders(prev => {
                      let changed = false;
                      const next = prev.map(folder => {
                        const folderName = (folder.name ?? '').trim();

                        if (sourceHadFilters && typeof sourceFolderName === 'string' && folderName === sourceFolderName.trim()) {
                          if (folder.filters !== undefined) changed = true;
                          return folder.filters !== undefined ? { ...folder, filters: undefined } : folder;
                        }

                        if (typeof targetFolderName === 'string' && folderName === targetFolderName.trim()) {
                          const nextFilters =
                            targetHadFilters
                              ? expandSelectedFolderFilters(folder.filters, sourceTasks)
                              : (sourceHadFilters && targetWasEmpty
                                ? cloneSelectedFolderFilters(sourceFolderDef?.filters)
                                : folder.filters);
                          const sameFilters = JSON.stringify(folder.filters ?? {}) === JSON.stringify(nextFilters ?? {});
                          if (!sameFilters) changed = true;
                          return sameFilters ? folder : { ...folder, filters: nextFilters };
                        }

                        return folder;
                      });

                      if (changed) {
                        AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => { });
                      }

                      return changed ? next : prev;
                    });
                  }
                  
                  // Se la cartella di destinazione era collassata, la apriamo
                  if (actualTarget!.folderId) {
                    setCollapsedFolderIds(prev => {
                      const next = new Set(prev);
                      next.delete(actualTarget!.folderId as string);
                      return next;
                    });
                  }

                  pendingDisplayRef.current = null;
                  setFolderMergeResetVersion(prev => prev + 1);
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
    applyFolderReorder(data);

  }, [updateHabitsOrder, updateHabitFolder, commitDragEnd, activeFolder, isMergeHoverSV, folders]);

  const simulatedIndexRef = useRef<number | null>(null);

  useAnimatedReaction(
    () => {
      'worklet';
      const v = animVals as any;
      if (!v || v.activeIndexAnim.value < 0) {
        return {
          isHovering: false,
          direction: 0,
          activeIndex: -1,
          simulatedIndex: -1
        };
      }

      const activeIdx = Math.round(v.activeIndexAnim.value);
      const spacerIdx = Math.round(v.spacerIndexAnim?.value ?? activeIdx);

      // hover = spostamento in px della cella trascinata rispetto al confine con la cella vicina (non dal centro).
      // Zero = linea di bordo tra le due celle; 48.75–upperBound = finestra merge misurata da quel bordo.
      const hover = v.hoverAnim?.value ?? 0;
      const direction = hover === 0 ? 0 : (hover < 0 ? -1 : 1);
      const absHover = Math.abs(hover);

      // Regola di business: una cartella vuota non puo' fare merge come sorgente,
      // ma una cartella piena puo' fare merge anche in una cartella vuota.
      let upperBound = 75.5;
      let lowerBound = 48.75;
      let virtualHover = absHover;
      let currentSimulatedIndex = activeIdx;
      let currentDir = direction;
      let isTargetEmpty = false;
      let isValidTarget = false;
      const sourceTaskCount =
        activeIdx >= 0 && activeIdx < folderTaskCountsSV.value.length
          ? folderTaskCountsSV.value[activeIdx]
          : 0;
      const canSourceMerge = sourceTaskCount > 0;
      
      if (direction !== 0 && canSourceMerge) {
        // Cicliamo per vedere quante cartelle abbiamo effettivamente "scavalcato" con il nostro hover
        while (true) {
          const nextIdx = currentSimulatedIndex + currentDir;
          
          if (nextIdx < 0 || nextIdx >= folderTaskCountsSV.value.length) {
            break; // Siamo fuori dai limiti
          }
          
          const taskCount = folderTaskCountsSV.value[nextIdx];
          const isNextEmpty = taskCount === 0;
          
          // Use exact measured height if available, fallback to estimate
          const exactHeight = folderHeightsSV.value[nextIdx];
          const estimatedHeight = isNextEmpty ? 34 : 34 + (taskCount * 79) + 4;
          const targetHeight = (exactHeight && exactHeight > 0) ? exactHeight : estimatedHeight;
          
          // upperBound per questa cartella target
          const currentUpperBound = isNextEmpty ? 0 : 75.5 + (taskCount - 1) * 87;
          
          // Distanza totale prima di fare il reset: l'utente ha chiesto di fare reset dopo aver superato la cartella
          // We use the real height of the folder block to avoid accumulation drift during autoscroll!
          const fullFolderDistance = isNextEmpty ? 37 : targetHeight;
          
          if (virtualHover >= fullFolderDistance) {
            // Abbiamo scavalcato completamente questa cartella! Reset
            virtualHover -= fullFolderDistance;
            currentSimulatedIndex = nextIdx; // Il nostro spacer si sposta dopo questa cartella
          } else {
            // Siamo "sopra" questa cartella. Ci fermiamo qui.
            isValidTarget = true;
            isTargetEmpty = isNextEmpty;
            if (!isTargetEmpty) {
               upperBound = currentUpperBound;
               lowerBound = 48.75;
            } else {
               upperBound = 28;
               lowerBound = 6;
            }
            break;
          }
        }
      }

      return {
        isHovering: canSourceMerge && isValidTarget && (virtualHover > lowerBound && virtualHover < upperBound),
        direction: currentDir,
        activeIndex: activeIdx,
        simulatedIndex: currentSimulatedIndex,
      };
    },
    (res) => {
      isMergeHoverSV.value = res.isHovering;
      dragDirectionSV.value = res.direction;
      runOnJS(updateOverlapHoverState)({
        isOverlapping: res.isHovering,
        activeIndex: res.simulatedIndex, // Usiamo l'indice simulato scavalcato per la UI (i numeri)
        direction: res.direction,
      });
      if (res.isHovering && res.direction !== 0) {
        lastMergeHoverTimeSV.value = Date.now();
        mergeDirectionSV.value = res.direction;
      }
    },
    [animVals, updateOverlapHoverState]
  );

  return {
    // habits context
    habits,
    history,
    removeHabit,
    resetToday,
    dayResetTime,
    setDayResetTime,
    updateHabitsOrder,
    updateHabitFolder,
    // state
    input,
    setInput,
    editingId,
    editingText,
    closingMenuId,
    sortMode,
    setSortMode,
    sortModeByFolder,
    setSortModeByFolder,
    folders,
    setFolders,
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
    isPostDragRef,
    preDragSnapshotRef,
    isMergeHoverSV,
    dragDirectionSV,
    isMergeHoverAtReleaseRef,
    dragDirectionAtReleaseRef,
    lastMergeHoverTimeSV,
    mergeDirectionSV,
    overlapHoverStateRef,
    overlapHoverState,
    animVals,
    setAnimVals,
    folderTaskCountsSV,
    folderHeightsSV,
    displayList,
    folderMergeResetVersion,
    setDisplayList,
    sectionOrder,
    fadingOutFolderId,
    optionsMenuVisible,
    setOptionsMenuVisible,
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    draggingSelectionCount,
    selectionOrder,
    collapsedFolderIds,
    today,
    // computed
    stats,
    effectiveSortMode,
    completedByHabitId,
    isFolderModeWithSections,
    folderTabsOrder,
    sectionedList,
    sortedHabits,
    habitsAppearingToday,
    // handlers
    handleAddFolder,
    handleCreateFolder,
    handleSaveEditFolder,
    performDeleteFolder,
    handleLongPressFolder,
    handleRename,
    handleSchedule,
    handleColor,
    handleMoveToFolder,
    handleMenuOpen,
    handleMenuClose,
    toggleSelect,
    recordDragStartSelection,
    buildCollapsedListIfMultiSelect,
    toggleFolderCollapsed,
    updateFoldersScrollEnabled,
    handleSectionedDragEnd,
    getFolderBlockFromHeaderIndex,
    validFolderDropIndices,
    folderIndicesArray,
    sortHabitsWithMode,
    resetStorage,
  };
}
