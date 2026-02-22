import { HabitItem } from '@/components/HabitItem';
import { THEME } from '@/constants/theme';
import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';

const TZ = 'Europe/Zurich';

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
  const [sortMode, setSortMode] = useState<'creation' | 'alphabetical' | 'custom' | 'time'>('creation');
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const today = getDay(new Date());

  useEffect(() => {
    AsyncStorage.getItem('tasks_custom_folders_v1').then((data) => {
      if (data) {
        try {
          setFolders(JSON.parse(data));
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const handleAddFolder = useCallback(() => {
    Alert.prompt(
      'Nuova Cartella',
      'Inserisci il nome della nuova cartella:',
      [
        { text: 'Annulla', style: 'cancel' },
        { 
          text: 'Crea', 
          onPress: (name) => {
            if (name && name.trim().length > 0) {
              const newFolders = [...folders, name.trim()];
              setFolders(newFolders);
              AsyncStorage.setItem('tasks_custom_folders_v1', JSON.stringify(newFolders)).catch(() => {});
              setActiveFolder(name.trim());
            }
          }
        }
      ],
      'plain-text'
    );
  }, [folders]);

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
            const newFolders = folders.filter(f => f !== folderName);
            setFolders(newFolders);
            AsyncStorage.setItem('tasks_custom_folders_v1', JSON.stringify(newFolders)).catch(() => {});
            if (activeFolder === folderName) {
              setActiveFolder(null);
            }
          }
        }
      ]
    );
  }, [folders, activeFolder]);

  useEffect(() => {
    AsyncStorage.getItem('tasks_sort_mode_v1').then((mode) => {
      if (mode === 'alphabetical' || mode === 'creation' || mode === 'custom' || mode === 'time') {
        setSortMode(mode as 'creation' | 'alphabetical' | 'custom' | 'time');
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
    // Per 'creation', ritorniamo la lista nell'ordine originale di inserimento (dal più vecchio al più nuovo)
    return list;
  }, [habits, sortMode, today]);

  const completedByHabitId = useMemo(
    () => history[today]?.completedByHabitId ?? {},
    [history, today]
  );

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<Habit>) => (
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
  ), [completedByHabitId, handleSchedule, closingMenuId]);

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
            style={[styles.folderChip, activeFolder === null && styles.folderChipActive]}
            onPress={() => setActiveFolder(null)}
          >
            <Text style={[styles.folderChipText, activeFolder === null && styles.folderChipTextActive]}>Tutte</Text>
          </TouchableOpacity>
          
          {folders.map(folderName => (
            <TouchableOpacity 
              key={folderName}
              style={[styles.folderChip, activeFolder === folderName && styles.folderChipActive]}
              onPress={() => setActiveFolder(folderName)}
              onLongPress={() => handleLongPressFolder(folderName)}
              delayLongPress={200}
            >
              <Text style={[styles.folderChipText, activeFolder === folderName && styles.folderChipTextActive]}>
                {folderName}
              </Text>
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity style={styles.folderAddBtn} onPress={handleAddFolder}>
            <Ionicons name="add" size={16} color={THEME.textMuted} />
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
    gap: 8,
  },
  folderChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  folderChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: '#3b82f6',
  },
  folderChipText: {
    color: THEME.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  folderChipTextActive: {
    color: '#3b82f6',
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