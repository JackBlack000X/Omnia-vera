import { THEME } from '@/constants/theme';
import { addMonths, getCalendarDays, getMonthName, getMonthYear, isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

type CompletionLevel = 'perfect' | 'good' | 'medium' | 'low';

function getCompletionLevel(completed: number, total: number): CompletionLevel {
  if (total === 0) return 'low';
  const pct = (completed / total) * 100;
  if (pct >= 100) return 'perfect';
  if (pct >= 75) return 'good';
  if (pct >= 50) return 'medium';
  return 'low';
}

function getCompletionColor(level: CompletionLevel): string {
  switch (level) {
    case 'perfect': return '#1e293b'; // dark blue-grey (perfect)
    case 'good': return '#334155'; // medium dark grey
    case 'medium': return '#475569'; // lighter dark grey
    case 'low': return '#0a0a0a'; // almost black
  }
}

export default function CalendarScreen() {
  const { habits, history } = useHabits();
  const [currentDate, setCurrentDate] = useState(new Date());
  const { year, month } = getMonthYear(currentDate);
  const days = getCalendarDays(year, month);

  // Keep only last 90 days of history
  const recentHistory = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    
    const filtered: typeof history = {};
    for (const [date, completion] of Object.entries(history)) {
      if (date >= cutoffStr) {
        filtered[date] = completion;
      }
    }
    return filtered;
  }, [history]);

  const dayStats = useMemo(() => {
    const stats: Record<string, { completed: number; total: number; level: CompletionLevel }> = {};
    
    for (const day of days) {
      const completion = recentHistory[day.ymd];
      const completed = completion ? Object.values(completion.completedByHabitId).filter(Boolean).length : 0;
      const total = habits.length;
      const level = getCompletionLevel(completed, total);
      stats[day.ymd] = { completed, total, level };
    }
    
    return stats;
  }, [days, recentHistory, habits.length]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  function navigateMonth(direction: 'prev' | 'next') {
    setCurrentDate(prev => addMonths(prev, direction === 'next' ? 1 : -1));
  }

  function selectDay(ymd: string) {
    setSelectedDay(ymd === selectedDay ? null : ymd);
  }

  const selectedStats = selectedDay ? dayStats[selectedDay] : null;
  const selectedCompletion = selectedDay ? recentHistory[selectedDay] : null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendario Abitudini</Text>
        <Text style={styles.subtitle}>Traccia i tuoi progressi nel tempo</Text>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.navBtn}>
          <Text style={styles.navText}>◀︎</Text>
        </TouchableOpacity>
        <Text style={styles.monthYear}>{getMonthName(month)} {year}</Text>
        <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.navBtn}>
          <Text style={styles.navText}>▶︎</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendar}>
        <View style={styles.weekHeader}>
          {DAYS.map(day => (
            <Text key={day} style={styles.dayHeader}>{day}</Text>
          ))}
        </View>
        
        <View style={styles.daysGrid}>
          {days.map((day, index) => {
            const stats = dayStats[day.ymd];
            const isCurrentMonth = day.isCurrentMonth;
            const isTodayDate = isToday(day.date);
            const isSelected = selectedDay === day.ymd;
            
            return (
              <TouchableOpacity
                key={index}
                onPress={() => selectDay(day.ymd)}
                style={[
                  styles.dayCell,
                  !isCurrentMonth && styles.dayOtherMonth,
                  isTodayDate && styles.dayToday,
                  isSelected && styles.daySelected,
                  stats && { backgroundColor: getCompletionColor(stats.level) }
                ]}
              >
                <Text style={[
                  styles.dayNumber,
                  !isCurrentMonth && styles.dayNumberOtherMonth,
                  isTodayDate && styles.dayNumberToday
                ]}>
                  {day.date.getDate()}
                </Text>
                {stats && stats.total > 0 && (
                  <View style={styles.dots}>
                    {Array.from({ length: Math.min(4, stats.completed) }).map((_, i) => (
                      <View key={i} style={styles.dot} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Legenda</Text>
        <View style={styles.legendItems}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#1e293b' }]} />
            <Text style={styles.legendText}>100% - Perfetto</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#334155' }]} />
            <Text style={styles.legendText}>75%+ - Buono</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#475569' }]} />
            <Text style={styles.legendText}>50%+ - Medio</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#0a0a0a' }]} />
            <Text style={styles.legendText}>Basso</Text>
          </View>
        </View>
      </View>

      {selectedDay && selectedStats && (
        <View style={styles.dayDetails}>
          <Text style={styles.dayDetailsTitle}>
            {new Date(selectedDay).toLocaleDateString('it-IT', { 
              weekday: 'long', 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            })}
          </Text>
          <Text style={styles.dayDetailsStats}>
            {selectedStats.completed} / {selectedStats.total} abitudini completate ({Math.round((selectedStats.completed / selectedStats.total) * 100)}%)
          </Text>
          
          <ScrollView style={styles.habitsList}>
            {habits.map(habit => {
              const isCompleted = selectedCompletion?.completedByHabitId?.[habit.id] ?? false;
              return (
                <View key={habit.id} style={styles.habitItem}>
                  <View style={[styles.habitCheck, isCompleted && styles.habitCheckCompleted]}>
                    {isCompleted && <Text style={styles.habitCheckText}>✓</Text>}
                  </View>
                  <Text style={[styles.habitText, isCompleted && styles.habitTextCompleted]}>
                    {habit.text}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEME.background, paddingHorizontal: 16 },
  header: { marginTop: 16, marginBottom: 24 },
  title: { color: '#e2e8f0', fontSize: 22, fontWeight: '500', marginBottom: 4, letterSpacing: 0.3 },
  subtitle: { color: '#64748b', fontSize: 14 },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingHorizontal: 4 },
  navBtn: { padding: 10, backgroundColor: '#0a0a0a', borderRadius: 6, borderWidth: 1, borderColor: '#1a1a1a', minWidth: 40, alignItems: 'center' },
  navText: { color: '#94a3b8', fontSize: 18, fontWeight: '400' },
  monthYear: { color: '#e2e8f0', fontSize: 17, fontWeight: '500', letterSpacing: 0.5 },

  calendar: { marginBottom: 20 },
  weekHeader: { flexDirection: 'row', marginBottom: 12, paddingHorizontal: 4 },
  dayHeader: { flex: 1, color: '#64748b', textAlign: 'center', fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dayCell: { 
    width: `${(100/7) - 0.8}%`, 
    aspectRatio: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderRadius: 4,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#1a1a1a'
  },
  dayOtherMonth: { opacity: 0.25 },
  dayToday: { borderWidth: 1.5, borderColor: '#ffffff' },
  daySelected: { borderWidth: 1.5, borderColor: '#64748b' },
  
  dayNumber: { color: '#e2e8f0', fontSize: 15, fontWeight: '500' },
  dayNumberOtherMonth: { color: '#475569' },
  dayNumberToday: { color: '#ffffff', fontWeight: '600' },
  
  dots: { position: 'absolute', bottom: 3, flexDirection: 'row', gap: 2 },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: '#94a3b8', opacity: 0.6 },

  legend: { marginBottom: 20, backgroundColor: '#0a0a0a', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  legendTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '500', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  legendItems: { gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#1a1a1a' },
  legendText: { color: '#64748b', fontSize: 13 },

  dayDetails: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: '#0a0a0a', 
    borderTopLeftRadius: 16, 
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#1a1a1a',
    padding: 20,
    maxHeight: '50%'
  },
  dayDetailsTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '500', marginBottom: 8, letterSpacing: 0.3 },
  dayDetailsStats: { color: '#64748b', fontSize: 13, marginBottom: 16 },
  habitsList: { maxHeight: 200 },
  habitItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  habitCheck: { width: 18, height: 18, borderRadius: 3, borderWidth: 1.5, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  habitCheckCompleted: { backgroundColor: '#1e293b', borderColor: '#475569' },
  habitCheckText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  habitText: { color: '#cbd5e1', fontSize: 14, flex: 1 },
  habitTextCompleted: { color: '#475569', textDecorationLine: 'line-through' },
});


