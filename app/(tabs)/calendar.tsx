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
    case 'perfect': return '#10b981'; // green
    case 'good': return '#f59e0b'; // orange
    case 'medium': return '#ef4444'; // red
    case 'low': return '#6b7280'; // grey
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
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.legendText}>100% - Giorno perfetto</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>75%+ - Buon progresso</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendText}>50%+ - Progresso medio</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6b7280' }]} />
            <Text style={styles.legendText}>Sotto il 50%</Text>
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
  screen: { flex: 1, backgroundColor: THEME.background, paddingHorizontal: 14 },
  header: { marginTop: 16, marginBottom: 20 },
  title: { color: THEME.text, fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: THEME.textMuted, fontSize: 16 },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  navBtn: { padding: 8 },
  navText: { color: THEME.accent, fontSize: 20, fontWeight: '600' },
  monthYear: { color: THEME.text, fontSize: 18, fontWeight: '700' },

  calendar: { marginBottom: 20 },
  weekHeader: { flexDirection: 'row', marginBottom: 8 },
  dayHeader: { flex: 1, color: '#64748b', textAlign: 'center', fontSize: 14, fontWeight: '600' },
  
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { 
    width: `${100/7}%`, 
    aspectRatio: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 4,
    borderRadius: 8,
    position: 'relative'
  },
  dayOtherMonth: { opacity: 0.3 },
  dayToday: { borderWidth: 2, borderColor: THEME.accent },
  daySelected: { borderWidth: 2, borderColor: '#3b82f6' },
  
  dayNumber: { color: THEME.text, fontSize: 16, fontWeight: '600' },
  dayNumberOtherMonth: { color: '#64748b' },
  dayNumberToday: { color: THEME.accent },
  
  dots: { position: 'absolute', bottom: 2, flexDirection: 'row', gap: 2 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: THEME.text },

  legend: { marginBottom: 20 },
  legendTitle: { color: THEME.text, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  legendItems: { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: THEME.textSecondary, fontSize: 14 },

  dayDetails: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: '#000', 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    padding: 20,
    maxHeight: '50%'
  },
  dayDetailsTitle: { color: THEME.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  dayDetailsStats: { color: THEME.textSecondary, fontSize: 14, marginBottom: 16 },
  habitsList: { maxHeight: 200 },
  habitItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  habitCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  habitCheckCompleted: { backgroundColor: '#10b981', borderColor: '#10b981' },
  habitCheckText: { color: THEME.text, fontSize: 12, fontWeight: '600' },
  habitText: { color: THEME.text, fontSize: 14, flex: 1 },
  habitTextCompleted: { color: '#64748b', textDecorationLine: 'line-through' },
});


