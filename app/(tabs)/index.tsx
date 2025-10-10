import { HabitItem } from '@/components/HabitItem';
import { THEME } from '@/constants/theme';
import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const { habits, history, getDay, toggleDone, removeHabit, updateHabit, addHabit, reorder, resetToday, dayResetTime, setDayResetTime } = useHabits();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [closingMenuId, setClosingMenuId] = useState<string | null>(null);
  const today = getDay(new Date());

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

  const handleRename = (h: Habit) => {
    setClosingMenuId(h.id);
    router.push({ pathname: '/modal', params: { type: 'rename', id: h.id } });
  };
  const handleSchedule = (h: Habit) => {
    setClosingMenuId(h.id);
    router.push({ pathname: '/modal', params: { type: 'edit', id: h.id } });
  };
  const handleColor = (h: Habit) => {
    setClosingMenuId(h.id);
    router.push({ pathname: '/modal', params: { type: 'edit', id: h.id } });
  };

  const renderItem = ({ item, index }: { item: Habit; index: number }) => (
    <HabitItem
      habit={item}
      index={index}
      onRename={handleSchedule}
      onSchedule={handleSchedule}
      onColor={handleSchedule}
      shouldCloseMenu={closingMenuId === item.id || closingMenuId === 'all'}
    />
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
      </View>

      <View style={styles.progressSection}>
        <Text style={styles.progressText}>{stats.pct}%</Text>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${stats.pct}%` }]} />
          </View>
          <View style={styles.progressActions}>
            <TouchableOpacity onPress={() => {
              Alert.alert(
                'Azzera le task di oggi?',
                'Vuoi segnare tutte le task come non completate per oggi?',
                [
                  { text: 'Annulla', style: 'cancel' },
                  { text: 'Conferma', style: 'destructive', onPress: resetToday }
                ]
              );
            }} style={styles.progressBtn}>
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
            }} style={styles.progressBtn}>
              <Ionicons name="time-outline" size={16} color={THEME.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {habits.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nessuna task ancora… Tocca + per aggiungere la tua prima task</Text>
        </View>
      ) : (
        <FlatList
          data={[...habits].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Link href={{ pathname: '/modal', params: { type: 'new' } }} asChild>
        <TouchableOpacity accessibilityRole="button" style={styles.fab}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Link>

      <TouchableOpacity accessibilityRole="button" style={styles.redFab}>
        <Ionicons name="settings" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: THEME.background, 
    paddingHorizontal: 16 
  },
  
  header: { 
    marginTop: 8, 
    marginBottom: 20 
  },
  title: { 
    fontSize: 28, 
    fontWeight: '700', 
    color: THEME.text
  },

  progressSection: {
    marginBottom: 20
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

  redFab: { 
    position: 'absolute', 
    left: 20, 
    bottom: 98, 
    backgroundColor: '#dc2626', 
    width: 83, 
    height: 83, 
    borderRadius: 42, 
    alignItems: 'center', 
    justifyContent: 'center', 
    shadowColor: '#dc2626', 
    shadowOpacity: 0.6, 
    shadowRadius: 20, 
    shadowOffset: { width: 0, height: 0 },
    elevation: 12
  },
});