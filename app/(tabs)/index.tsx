import { HabitItem } from '@/components/HabitItem';
import { THEME } from '@/constants/theme';
import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
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
  const { habits, history, getDay, toggleDone, removeHabit, updateHabit, addHabit, reorder, updateHabitsOrder, resetToday, dayResetTime, setDayResetTime } = useHabits();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [closingMenuId, setClosingMenuId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'creation' | 'alphabetical' | 'custom' | 'time' | 'color' | 'folder'>('creation');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[3]);
  const [newFolderIcon, setNewFolderIcon] = useState(FOLDER_ICONS[0].name);
  const today = getDay(new Date());

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
        setSortMode(mode as 'creation' | 'alphabetical' | 'custom' | 'time' | 'color' | 'folder');
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('tasks_sort_mode_v1', sortMode).catch(() => {});
  }, [sortMode]);

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

  const sortedHabits = useMemo(() => {
    let list = [...habits];
    
    if (activeFolder) {
      list = list.filter(h => h.folder === activeFolder);
    }

    if (sortMode === 'alphabetical') {
      return list.sort((a, b) => a.text.localeCompare(b.text));
    }
    if (sortMode === 'custom') {
      return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    if (sortMode === 'color') {
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
      return list.sort((a, b) => {
        const hueA = hexToHue(a.color ?? '#4A148C');
        const hueB = hexToHue(b.color ?? '#4A148C');
        const diff = hueA - hueB;
        return diff !== 0 ? diff : (a.order ?? 0) - (b.order ?? 0);
      });
    }
    if (sortMode === 'time') {
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

      return list.sort((a, b) => getStartTime(a) - getStartTime(b));
    }
    if (sortMode === 'folder') {
      return list.sort((a, b) => {
        const fa = a.folder ?? '';
        const fb = b.folder ?? '';
        const cmp = fa.localeCompare(fb);
        return cmp !== 0 ? cmp : (a.order ?? 0) - (b.order ?? 0);
      });
    }
    // Per 'creation', ritorniamo la lista nell'ordine originale di inserimento (dal più vecchio al più nuovo)
    return list;
  }, [habits, sortMode, today, activeFolder]);

  const completedByHabitId = useMemo(
    () => history[today]?.completedByHabitId ?? {},
    [history, today]
  );

  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<Habit>) => {
    const idx = getIndex?.() ?? sortedHabits.findIndex(h => h.id === item.id);
    const prev = idx >= 0 ? sortedHabits[idx - 1] : undefined;
    const showFolderHeader = activeFolder === null && (!prev || prev.folder !== item.folder) && item.folder;
    const folderMeta = folders.find(f => f.name === item.folder);
    const folderColor = folderMeta?.color ?? THEME.textMuted;
    return (
      <View>
        {showFolderHeader && (
          <View style={styles.folderSeparator}>
            <Text style={[styles.folderSeparatorText, { color: folderColor }]}>{item.folder}</Text>
          </View>
        )}
        <ScaleDecorator>
          <TouchableOpacity 
            onLongPress={drag} 
            disabled={isActive} 
            activeOpacity={0.9} 
            delayLongPress={200}
          >
            <HabitItem
              habit={item}
              index={0}
              isDone={Boolean(completedByHabitId[item.id])}
              onRename={handleSchedule}
              onSchedule={handleSchedule}
              onColor={handleSchedule}
              shouldCloseMenu={closingMenuId === item.id || closingMenuId === 'all'}
            />
          </TouchableOpacity>
        </ScaleDecorator>
      </View>
    );
  }, [completedByHabitId, handleSchedule, closingMenuId, activeFolder, sortedHabits, folders]);

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
              Alert.alert(
                'Ordina task',
                'Scegli come ordinare le tue task',
                [
                  { text: 'Annulla', style: 'cancel' },
                  { text: 'Data di creazione', onPress: () => setSortMode('creation') },
                  { text: 'Orario', onPress: () => setSortMode('time') },
                  { text: 'Ordine per colore', onPress: () => setSortMode('color') },
                  { text: 'Ordine per cartelle', onPress: () => setSortMode('folder') },
                  { text: 'Ordine alfabetico', onPress: () => setSortMode('alphabetical') },
                  { text: 'Ordine libero (Trascina)', onPress: () => setSortMode('custom') },
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

      <View style={styles.foldersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.foldersScroll}>
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
        <DraggableFlatList
          data={sortedHabits}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContainer, activeTheme === 'futuristic' && { paddingHorizontal: -16 }]}
          style={activeTheme === 'futuristic' && { marginHorizontal: -16 }}
          showsVerticalScrollIndicator={false}
          onDragEnd={({ data }) => {
            updateHabitsOrder(data);
            setSortMode('custom');
          }}
        />
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