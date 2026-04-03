import { useHabits } from '@/lib/habits/Provider';
import { isHabitFullyDoneForDay } from '@/lib/habits/occurrences';
import type { Habit } from '@/lib/habits/schema';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type SortMode = 'app' | 'alphabetical' | 'color' | 'recent';
type StatusFilter = 'all' | 'open' | 'completed';

type SearchResult = {
  habit: Habit;
  isCompleted: boolean;
  score: number;
};

const weekdayLabels = ['Domenica', 'Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato'] as const;

const sortLabels: Record<SortMode, string> = {
  app: 'Ordine app',
  alphabetical: 'Alfabetico',
  color: 'Per colore',
  recent: 'Piu recenti',
};

const statusLabels: Record<StatusFilter, string> = {
  all: 'Tutte',
  open: 'Aperte',
  completed: 'Completate',
};

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getCreatedAtRank(habit: Habit) {
  if (typeof habit.createdAtMs === 'number') return habit.createdAtMs;
  if (habit.createdAt) {
    const timestamp = Date.parse(`${habit.createdAt}T00:00:00Z`);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return 0;
}

function getTimeLabel(habit: Habit) {
  const start = habit.schedule?.time;
  const end = habit.schedule?.endTime;
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  return habit.habitFreq === 'single' ? 'Singola' : 'Senza orario';
}

function getScheduleLabel(habit: Habit) {
  const days = habit.schedule?.daysOfWeek ?? [];
  if (days.length > 0) return days.map((day) => weekdayLabels[day]).join(', ');
  if (habit.habitFreq === 'daily') return 'Ogni giorno';
  if (habit.habitFreq === 'weekly') return 'Settimanale';
  if (habit.habitFreq === 'monthly') return 'Mensile';
  if (habit.habitFreq === 'annual') return 'Annuale';
  return habit.tipo === 'abitudine' ? 'Abitudine' : 'Task';
}

export default function SearchScreen() {
  const router = useRouter();
  const { habits, history, getDay } = useHabits();
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('app');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const logicalTodayYmd = useMemo(() => getDay(new Date()), [getDay]);
  const logicalTodayHistory = history[logicalTodayYmd];
  const normalizedQuery = useMemo(() => normalizeSearchText(query), [query]);

  const openStatusPicker = useCallback(() => {
    const options: StatusFilter[] = ['all', 'open', 'completed'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Filtra per stato',
        options: [...options.map((option) => statusLabels[option]), 'Annulla'],
        cancelButtonIndex: options.length,
      },
      (buttonIndex) => {
        if (buttonIndex < options.length) setStatusFilter(options[buttonIndex]);
      },
    );
  }, []);

  const openSortPicker = useCallback(() => {
    const options: SortMode[] = ['app', 'alphabetical', 'color', 'recent'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Ordina risultati',
        options: [...options.map((option) => sortLabels[option]), 'Annulla'],
        cancelButtonIndex: options.length,
      },
      (buttonIndex) => {
        if (buttonIndex < options.length) setSortMode(options[buttonIndex]);
      },
    );
  }, []);

  const openFilterMenu = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Filtri Cerca',
        message: `${sortLabels[sortMode]} • ${statusLabels[statusFilter]}`,
        options: ['Ordina risultati', 'Filtra per stato', 'Annulla'],
        cancelButtonIndex: 2,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) openSortPicker();
        if (buttonIndex === 1) openStatusPicker();
      },
    );
  }, [openSortPicker, openStatusPicker, sortMode, statusFilter]);

  const results = useMemo(() => {
    return habits
      .filter((habit) => habit.tipo === 'task' || habit.tipo === 'abitudine')
      .map((habit) => {
        const isCompleted = isHabitFullyDoneForDay(logicalTodayHistory, habit);
        const searchableText = normalizeSearchText(habit.text);
        const score = normalizedQuery
          ? (searchableText.startsWith(normalizedQuery) ? 0 : searchableText.includes(normalizedQuery) ? 1 : 2)
          : 0;

        return { habit, isCompleted, score };
      })
      .filter((item) => {
        if (statusFilter === 'open' && item.isCompleted) return false;
        if (statusFilter === 'completed' && !item.isCompleted) return false;
        if (!normalizedQuery) return true;
        return normalizeSearchText(item.habit.text).includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (normalizedQuery && left.score !== right.score) return left.score - right.score;

        switch (sortMode) {
          case 'alphabetical':
            return left.habit.text.localeCompare(right.habit.text, 'it');
          case 'color': {
            const leftColor = left.habit.color ?? '';
            const rightColor = right.habit.color ?? '';
            const byColor = leftColor.localeCompare(rightColor, 'it');
            if (byColor !== 0) return byColor;
            return left.habit.text.localeCompare(right.habit.text, 'it');
          }
          case 'recent': {
            const byRecent = getCreatedAtRank(right.habit) - getCreatedAtRank(left.habit);
            if (byRecent !== 0) return byRecent;
            return left.habit.text.localeCompare(right.habit.text, 'it');
          }
          case 'app':
          default: {
            const leftOrder = left.habit.order ?? 0;
            const rightOrder = right.habit.order ?? 0;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return left.habit.text.localeCompare(right.habit.text, 'it');
          }
        }
      });
  }, [habits, logicalTodayHistory, normalizedQuery, sortMode, statusFilter]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={openFilterMenu} hitSlop={10} style={styles.headerButton}>
              <Ionicons name="options-outline" size={22} color="#fff" />
            </Pressable>
          ),
        }}
      />

      <Stack.SearchBar
        placeholder="Cerca task e abitudini..."
        placement="automatic"
        hideWhenScrolling={false}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroRow}>
          <Text style={styles.heroTitle}>Cerca</Text>
          <Pressable onPress={openFilterMenu} hitSlop={10} style={styles.inlineFilterButton}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#9ca3af" />
          </Pressable>
        </View>

        <View style={styles.toolbarRow}>
          <Text style={styles.resultCount}>
            {results.length === 1 ? '1 risultato' : `${results.length} risultati`}
          </Text>
          <View style={styles.toolbarMeta}>
            <Text style={styles.metaPill}>{sortLabels[sortMode]}</Text>
            <Text style={styles.metaPill}>{statusLabels[statusFilter]}</Text>
          </View>
        </View>

        {results.length > 0 ? (
          <View style={styles.resultsList}>
            {results.map(({ habit, isCompleted }: SearchResult) => (
              <Pressable
                key={habit.id}
                onPress={() => {
                  router.push({
                    pathname: '/modal',
                    params: { type: 'edit', id: habit.id },
                  });
                }}
                style={({ pressed }) => [
                  styles.resultCard,
                  { backgroundColor: habit.color ?? '#111827' },
                  pressed ? styles.resultCardPressed : null,
                ]}
              >
                <View style={styles.leadingCheckWrap}>
                  <View style={styles.leadingCheckCircle} />
                </View>
                <View style={[styles.resultBody, styles.resultBodyCard]}>
                  <Text style={styles.resultTitle} numberOfLines={1}>
                    {habit.text}
                  </Text>
                  <Text style={styles.resultTime}>{getTimeLabel(habit)}</Text>
                  <Text style={styles.resultSubtitle} numberOfLines={1}>
                    {getScheduleLabel(habit)}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaPill}>{habit.tipo === 'abitudine' ? 'Abitudine' : 'Task'}</Text>
                    <Text style={styles.metaPill}>{isCompleted ? 'Completata' : 'Aperta'}</Text>
                  </View>
                </View>
                <Ionicons
                  name={isCompleted ? 'notifications' : 'chevron-forward'}
                  size={isCompleted ? 18 : 20}
                  color={isCompleted ? '#ff5a4f' : '#d1d5db'}
                  style={[styles.stateIcon, isCompleted ? styles.alertIcon : null]}
                />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={28} color="#64748b" />
            <Text style={styles.emptyTitle}>Nessun risultato</Text>
            <Text style={styles.emptyText}>
              Prova un altro nome oppure cambia ordinamento o stato dal pulsante filtro.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  headerButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  inlineFilterButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarRow: {
    gap: 10,
    marginBottom: 18,
  },
  toolbarMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultCount: {
    color: '#94a3b8',
    fontSize: 13,
  },
  resultsList: {
    gap: 12,
  },
  resultCard: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultCardPressed: {
    opacity: 0.88,
  },
  leadingCheckWrap: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadingCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.8,
    borderColor: '#d1d5db',
  },
  resultBodyCard: {
    minHeight: 78,
    justifyContent: 'center',
  },
  resultBody: {
    flex: 1,
    gap: 8,
  },
  resultTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  resultTime: {
    color: '#f3f4f6',
    fontSize: 13,
    fontWeight: '500',
  },
  resultSubtitle: {
    color: '#d1d5db',
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    color: '#cbd5e1',
    fontSize: 12,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stateIcon: {
    marginLeft: 4,
  },
  alertIcon: {
    marginTop: -22,
  },
  emptyState: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
