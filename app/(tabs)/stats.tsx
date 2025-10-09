import { THEME } from '@/constants/theme';
import { buildCsv } from '@/lib/csv';
import { useHabits } from '@/lib/habits/Provider';
import * as Clipboard from 'expo-clipboard';
import React, { useMemo } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function getLast7Days(): string[] {
  const arr: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    arr.push(d.toISOString().split('T')[0]);
  }
  return arr.reverse();
}

export default function StatsScreen() {
  const { habits, history } = useHabits();

  const todayKey = new Date().toISOString().split('T')[0];
  const todayCompleted = useMemo(() => Object.values(history[todayKey]?.completedByHabitId ?? {}).filter(Boolean).length, [history, todayKey]);

  const activeDays = useMemo(() => Object.keys(history).filter(k => Object.values(history[k]?.completedByHabitId ?? {}).some(Boolean)).length, [history]);

  const bestStreak = useMemo(() => {
    const dates = Object.keys(history).sort();
    let best = 0; let cur = 0; let prev: string | null = null;
    for (const d of dates) {
      const any = Object.values(history[d]?.completedByHabitId ?? {}).some(Boolean);
      if (!any) { cur = 0; prev = null; continue; }
      if (!prev) { cur = 1; prev = d; best = Math.max(best, cur); continue; }
      const prevDate = new Date(prev); const nextDate = new Date(prevDate); nextDate.setDate(prevDate.getDate() + 1);
      const exp = nextDate.toISOString().split('T')[0];
      if (d === exp) cur += 1; else cur = 1;
      prev = d; best = Math.max(best, cur);
    }
    return best;
  }, [history]);

  const averageCompletion = useMemo(() => {
    const dates = Object.keys(history);
    if (dates.length === 0 || habits.length === 0) return 0;
    let sum = 0;
    for (const d of dates) {
      const c = Object.values(history[d]?.completedByHabitId ?? {}).filter(Boolean).length;
      sum += (c / habits.length) * 100;
    }
    return Math.round(sum / dates.length);
  }, [history, habits.length]);

  const leaderboard = useMemo(() => {
    const counts: Record<string, number> = {};
    const totals: Record<string, number> = {};
    for (const h of habits) { counts[h.id] = 0; totals[h.id] = 0; }
    for (const d of Object.keys(history)) {
      const map = history[d]?.completedByHabitId ?? {};
      for (const h of habits) {
        totals[h.id] += 1;
        if (map[h.id]) counts[h.id] += 1;
      }
    }
    return [...habits].map(h => ({ id: h.id, text: h.text, pct: totals[h.id] ? Math.round((counts[h.id] / totals[h.id]) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [habits, history]);

  const weekly = useMemo(() => {
    const days = getLast7Days();
    const items = days.map(d => {
      const completed = Object.values(history[d]?.completedByHabitId ?? {}).filter(Boolean).length;
      return { date: d, completed, total: habits.length };
    });
    const totalCompleted = items.reduce((a, b) => a + b.completed, 0);
    const totalPossible = items.reduce((a, b) => a + b.total, 0);
    const perfectDays = items.filter(i => i.total > 0 && i.completed === i.total).length;
    return { items, totalCompleted, totalPossible, perfectDays };
  }, [history, habits.length]);

  async function exportCsv() {
    const csv = buildCsv(history);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'habit-check.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      await Clipboard.setStringAsync(csv);
      Alert.alert('CSV copiato', 'Contenuto copiato negli appunti.');
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Statistiche</Text>
        <TouchableOpacity onPress={exportCsv} style={styles.csvBtn}>
          <Text style={styles.csvText}>CSV</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cards}>
        <View style={styles.card}><Text style={styles.cardBig}>{todayCompleted}/{habits.length}</Text><Text style={styles.cardLabel}>Oggi</Text></View>
        <View style={styles.card}><Text style={styles.cardBig}>{averageCompletion}%</Text><Text style={styles.cardLabel}>Questa settimana</Text></View>
        <View style={styles.card}><Text style={styles.cardBig}>{activeDays}</Text><Text style={styles.cardLabel}>Giorni attivi</Text></View>
        <View style={styles.card}><Text style={styles.cardBig}>{bestStreak}</Text><Text style={styles.cardLabel}>Serie migliore</Text></View>
      </View>

      <ScrollView>
        <Text style={styles.sectionTitle}>Abitudini più completate</Text>
        {leaderboard.map((l, idx) => (
          <View key={l.id} style={styles.rowItem}>
            <Text style={styles.rank}>#{idx + 1}</Text>
            <Text style={styles.rowText}>{l.text}</Text>
            <Text style={styles.rowPct}>{l.pct}%</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Panoramica settimanale</Text>
        <View style={styles.weekBox}>
          <Text style={styles.weekText}>Abitudini completate: {weekly.totalCompleted}</Text>
          <Text style={styles.weekText}>Totale possibili: {weekly.totalPossible}</Text>
          <Text style={styles.weekText}>Giorni perfetti: {weekly.perfectDays}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEME.background, paddingHorizontal: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  title: { color: THEME.text, fontSize: 24, fontWeight: '700' },
  csvBtn: { backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  csvText: { color: THEME.text, fontWeight: '700' },

  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 16 },
  card: { flexBasis: '48%', backgroundColor: '#000', borderColor: '#334155', borderWidth: 1, borderRadius: 14, padding: 12 },
  cardBig: { color: THEME.text, fontSize: 22, fontWeight: '700' },
  cardLabel: { color: THEME.textMuted, marginTop: 4 },

  sectionTitle: { color: THEME.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  rowItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  rank: { color: '#22d3ee', width: 30, fontWeight: '700' },
  rowText: { color: THEME.text, flex: 1 },
  rowPct: { color: THEME.text, fontWeight: '700' },

  weekBox: { backgroundColor: '#000', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  weekText: { color: THEME.textSecondary },
});


