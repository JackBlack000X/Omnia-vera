import { styles as indexStyles } from '@/components/index/indexStyles';
import { THEME } from '@/constants/theme';
import { useHabits } from '@/lib/habits/Provider';
import { isHabitFullyDoneForDay } from '@/lib/habits/occurrences';
import type { Habit } from '@/lib/habits/schema';
import { HabitItem } from '@/components/HabitItem';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

import { useIsFocused } from '@react-navigation/native';

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
      .filter((habit) => {
        const tipo = habit.tipo ?? 'task';
        return tipo === 'task' || tipo === 'abitudine';
      })
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
          title: 'Cerca',
          headerLargeTitle: true,
          headerTitleStyle: { color: THEME.text },
          headerLargeTitleStyle: {
            color: THEME.text,
            fontWeight: 'bold',
          },
          headerRight: () => (
            <Pressable
              onPress={openFilterMenu}
              hitSlop={10}
              style={({ pressed }) => [{
                width: 36,
                height: 36,
                borderRadius: 18,
                overflow: 'hidden',
                backgroundColor: '#1a1a1a',
                justifyContent: 'center',
                alignItems: 'center',
              }, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}
            >
              <Ionicons name="options-outline" size={24} color="rgba(255,255,255,0.9)" />
            </Pressable>
          ),
          headerSearchBarOptions: {
            placeholder: 'Cerca task e abitudini...',
            hideNavigationBar: false,
            hideWhenScrolling: false,
            textColor: THEME.text,
            onChangeText: (event) => setQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />

      <View style={[indexStyles.screen, styles.safeFill, { overflow: 'visible', zIndex: 999 }]}>
        <ScrollView
          style={[styles.screen, { overflow: 'visible' }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >

          <View style={styles.toolbarRow}>
            <View style={styles.toolbarLeft}>
              <Text style={styles.resultCount}>
                {results.length === 1 ? '1 risultato' : `${results.length} risultati`}
              </Text>
            </View>
          </View>

          {results.length > 0 ? (
            <View style={styles.resultsList}>
              {results.map((item: SearchResult, index: number) => {
                const { habit, isCompleted } = item;
                const goEdit = () => {
                  router.push({
                    pathname: '/modal',
                    params: { type: 'edit', id: habit.id },
                  });
                };
                return (
                  <Pressable
                    key={habit.id}
                    onPress={goEdit}
                    style={({ pressed }) => [pressed && { opacity: 0.88 }, { marginBottom: 4 }]}
                  >
                    <HabitItem
                      habit={habit}
                      index={index}
                      isDone={isCompleted}
                      completionMode="day"
                      onRename={goEdit}
                      onSchedule={goEdit}
                      onColor={goEdit}
                    />
                  </Pressable>
                );
              })}
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitleText: {
    color: THEME.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerRow: {
    marginTop: 2,
    marginBottom: 10,
  },
  safeFill: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingTop: 0,
    paddingBottom: 40,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 0,
    marginBottom: 6,
  },
  toolbarLeft: {
    flex: 1,
    minWidth: 0,
    gap: 10,
    paddingLeft: 7,
  },
  filterCluster: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  filterGlass: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterClusterPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
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
