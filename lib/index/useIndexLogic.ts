import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import {
  FOLDER_COLORS,
  FOLDER_ICONS,
  FolderBlockItem,
  FolderItem,
  OGGI_TODAY_KEY,
  SectionItem,
  SortModeType,
  TUTTE_KEY,
} from '@/lib/index/indexTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useSharedValue, useAnimatedReaction } from 'react-native-reanimated';

export function useIndexLogic() {
  const router = useRouter();
  const { habits, history, getDay, toggleDone, removeHabit, updateHabit, addHabit, reorder, updateHabitsOrder, updateHabitFolder, setHabits, resetToday, dayResetTime, setDayResetTime } = useHabits();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [closingMenuId, setClosingMenuId] = useState<string | null>(null);
  const [openMenuHabitId, setOpenMenuHabitId] = useState<string | null>(null);
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
  const lastMergeHoverTimeRef = useRef<number>(0);
  const mergeDirectionRef = useRef(0); // last non-zero direction while merge indicator was active
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

  const sectionedListOrderKey = useCallback((list: SectionItem[]) => {
    return list.map(i => {
      if (i.type === 'folderBlock') return `f-${i.folderId}-${i.tasks.map(t => `${t.id}:${t.text}:${t.folder ?? ''}:${t.color ?? ''}`).join('|')}`;
      return `t-${i.habit.id}-${i.habit.text}-${i.habit.folder ?? ''}-${i.habit.color ?? ''}`;
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

  const sortedHabits = useMemo(() => {
    let list: Habit[];
    if (activeFolder === OGGI_TODAY_KEY) {
      list = habitsAppearingToday.filter(h => !singleHabitsHiddenAfterReset.has(h.id));
    } else if (activeFolder) {
      const target = activeFolder.trim();
      list = habits.filter(h => (h.folder ?? '').trim() === target && !singleHabitsHiddenAfterReset.has(h.id));
    } else {
      list = habits.filter(h => !singleHabitsHiddenAfterReset.has(h.id));
    }
    return sortHabitsList(list);
  }, [habits, habitsAppearingToday, sortMode, today, activeFolder, sortHabitsList, singleHabitsHiddenAfterReset]);

  const sectionedList = useMemo((): SectionItem[] => {
    const isOggiView = activeFolder === OGGI_TODAY_KEY;
    const isFolderStructureView = isOggiView || (activeFolder === null && sortMode === 'folder');

    if (!isFolderStructureView) {
      return sortedHabits.map(h => ({ type: 'task' as const, habit: h }));
    }

    const sourceHabits = isOggiView
      ? habitsAppearingToday.filter(h => !singleHabitsHiddenAfterReset.has(h.id))
      : habits.filter(h => !singleHabitsHiddenAfterReset.has(h.id));
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
  }, [habits, habitsAppearingToday, folders, activeFolder, sortMode, sortModeByFolder, sortedHabits, sortHabitsWithMode, sectionOrder, singleHabitsHiddenAfterReset]);

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

  const commitDragEnd = useCallback(() => {
    isMergeHoverSV.value = false;
  }, [isMergeHoverSV]);
  commitDragEndRef.current = commitDragEnd;

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
                  setDisplayList(snapshot);
                  isPostDragRef.current = false;
                  preDragSnapshotRef.current = null;
                  commitDragEnd();
                }
              },
              {
                text: 'Sì', onPress: () => {
                  const targetFolder = actualTarget!.folderName === null ? undefined : (actualTarget!.folderName as string);
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

      const activeIdx = Math.round(v.activeIndexAnim.value);
      const hover = v.hoverAnim?.value ?? 0;
      const direction = hover === 0 ? 0 : (hover < 0 ? -1 : 1);
      const absHover = Math.abs(hover);

      // Block the merge indicator if the TARGET (the folder being approached) is empty.
      // We check the neighbor slot, not activeIdx, because after a swap the dragged item
      // occupies the slot that originally belonged to another folder, and
      // emptyFoldersIndicesSV (built from the pre-drag order) would wrongly flag it as empty.
      // The neighbor one step ahead has never been displaced, so its original index is still valid.
      if (direction !== 0) {
        const neighborIdx = activeIdx + direction;
        if (neighborIdx >= 0 && neighborIdx < emptyFoldersIndicesSV.value.length &&
            emptyFoldersIndicesSV.value[neighborIdx] === 1) {
          return { isHovering: false, direction };
        }
      }

      return {
        isHovering: absHover > 44 && absHover < 60,
        direction
      };
    },
    (res) => {
      if (res !== null) {
        isMergeHoverSV.value = res.isHovering;
        dragDirectionSV.value = res.direction;
        if (res.isHovering && res.direction !== 0) {
          lastMergeHoverTimeRef.current = Date.now();
          mergeDirectionRef.current = res.direction;
        }
      }
    },
    [animVals]
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
    lastMergeHoverTimeRef,
    mergeDirectionRef,
    animVals,
    setAnimVals,
    emptyFoldersIndicesSV,
    displayList,
    setDisplayList,
    sectionOrder,
    fadingOutFolderId,
    optionsMenuVisible,
    setOptionsMenuVisible,
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
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
    updateFoldersScrollEnabled,
    handleSectionedDragEnd,
    getFolderBlockFromHeaderIndex,
    validFolderDropIndices,
    folderIndicesArray,
    sortHabitsWithMode,
  };
}
