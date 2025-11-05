import { getCalendarDays, getMonthName, getMonthYear, isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

function getCompletionStyle(level: CompletionLevel, isPast: boolean): { backgroundColor?: string; borderColor?: string; borderWidth?: number } {
  switch (level) {
    case 'perfect': return { backgroundColor: '#00FF00' }; // bright green
    case 'good': return { backgroundColor: '#FF8C00' }; // orange
    case 'medium': return { backgroundColor: '#FFD700' }; // yellow
    case 'low': return isPast ? { backgroundColor: '#FF0000' } : {}; // red only for past days
  }
}

// Test state - temporary completion override for testing
type TestCompletion = {
  completed: number;
  total: number;
};

function calculateCompletedForLevel(level: CompletionLevel, total: number): number {
  switch (level) {
    case 'perfect': return total; // 100%
    case 'good': return Math.ceil(total * 0.75); // 75%+
    case 'medium': return Math.ceil(total * 0.5); // 50%+
    case 'low': return Math.floor(total * 0.25); // < 50%
  }
}

export default function CalendarScreen() {
  const { habits, history } = useHabits();
  const today = new Date();
  const { year: currentYear, month: currentMonth } = getMonthYear(today);
  
  // Test state - temporary override for testing colors
  const [testCompletions, setTestCompletions] = useState<Record<string, TestCompletion>>({});
  const [showLegend, setShowLegend] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const screenHeight = 400; // Altezza di un mese
  
  // Genera tutti i mesi da oggi (nov 2025) fino a 10 anni dopo (nov 2035)
  const allMonths = useMemo(() => {
    const months: Array<{ year: number; month: number; date: Date }> = [];
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear + 10, currentMonth - 1, 1);
    
    for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      const { year, month } = getMonthYear(d);
      months.push({ year, month, date: new Date(d) });
    }
    
    return months;
  }, [currentYear, currentMonth]);
  
  // Trova l'indice del mese corrente
  const currentMonthIndex = useMemo(() => {
    return allMonths.findIndex(m => m.year === currentYear && m.month === currentMonth);
  }, [allMonths, currentYear, currentMonth]);
  
  // Scrolla al mese corrente all'avvio
  React.useEffect(() => {
    if (currentMonthIndex >= 0 && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ 
          y: currentMonthIndex * screenHeight, 
          animated: false 
        });
      }, 100);
    }
  }, [currentMonthIndex, screenHeight]);

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

  function getDayStatsForMonth(monthYear: number, monthNum: number) {
    const days = getCalendarDays(monthYear, monthNum);
    const stats: Record<string, { completed: number; total: number; level: CompletionLevel }> = {};
    
    for (const day of days) {
      // Use test completion if available, otherwise use real history
      const testCompletion = testCompletions[day.ymd];
      let completed = 0;
      
      if (testCompletion) {
        completed = testCompletion.completed;
      } else {
        const completion = recentHistory[day.ymd];
        completed = completion ? Object.values(completion.completedByHabitId).filter(Boolean).length : 0;
      }
      
      const total = habits.length;
      const level = getCompletionLevel(completed, total);
      stats[day.ymd] = { completed, total, level };
    }
    
    return { days, stats };
  }

  function handleDayPress(day: { date: Date; isCurrentMonth: boolean; ymd: string }) {
    const total = habits.length;
    if (total === 0) {
      Alert.alert('Test', 'Nessuna abitudine disponibile');
      return;
    }

    Alert.alert(
      'Test - Imposta Completamento',
      'Scegli il livello di completamento:',
      [
        {
          text: '100% - Giorno perfetto',
          onPress: () => {
            setTestCompletions(prev => ({
              ...prev,
              [day.ymd]: { completed: total, total }
            }));
          }
        },
        {
          text: '75%+ - Buon progresso',
          onPress: () => {
            setTestCompletions(prev => ({
              ...prev,
              [day.ymd]: { completed: calculateCompletedForLevel('good', total), total }
            }));
          }
        },
        {
          text: '50%+ - Progresso medio',
          onPress: () => {
            setTestCompletions(prev => ({
              ...prev,
              [day.ymd]: { completed: calculateCompletedForLevel('medium', total), total }
            }));
          }
        },
        {
          text: 'Sotto il 50%',
          onPress: () => {
            setTestCompletions(prev => ({
              ...prev,
              [day.ymd]: { completed: calculateCompletedForLevel('low', total), total }
            }));
          }
        },
        {
          text: 'Rimuovi (usa dati reali)',
          onPress: () => {
            setTestCompletions(prev => {
              const next = { ...prev };
              delete next[day.ymd];
              return next;
            });
          },
          style: 'destructive'
        },
        {
          text: 'Annulla',
          style: 'cancel'
        }
      ]
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Calendario Abitudini</Text>
          </View>
          <TouchableOpacity onPress={() => setShowLegend(true)} style={styles.infoButton}>
            <View style={styles.infoCircle}>
              <Text style={styles.infoText}>i</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        snapToInterval={screenHeight}
        decelerationRate="fast"
      >
        {allMonths.map((monthData, monthIndex) => {
          const { year, month } = monthData;
          const isCurrentMonthActive = year === currentYear && month === currentMonth;
          const { days, stats: dayStats } = getDayStatsForMonth(year, month);
          
          return (
            <View key={`${year}-${month}`} style={styles.calendarMonth}>
              <View style={styles.monthNav}>
                <Text style={[styles.monthYear, isCurrentMonthActive && styles.monthYearActive]}>
                  {getMonthName(month)} {year}
                </Text>
              </View>
              <View style={styles.calendar}>
                <View style={styles.weekHeader}>
                  {DAYS.map((day) => (
                    <View key={day} style={styles.dayHeaderContainer}>
                      <Text style={styles.dayHeader}>{day}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.daysGrid}>
                  {days.map((day, index) => {
                    const stats = dayStats[day.ymd];
                    const isCurrentMonth = day.isCurrentMonth;
                    const isTodayDate = isToday(day.date);
                    const todayDate = new Date();
                    todayDate.setHours(0, 0, 0, 0);
                    const dayDate = new Date(day.date);
                    dayDate.setHours(0, 0, 0, 0);
                    const isPast = dayDate < todayDate;
                    const completionStyle = stats ? getCompletionStyle(stats.level, isPast) : {};
                    const hasBackground = completionStyle.backgroundColor !== undefined;
                    
                    return (
                      <TouchableOpacity
                        key={index}
                        onPress={() => handleDayPress(day)}
                        style={[
                          styles.dayCell,
                          !isCurrentMonth && styles.dayOtherMonth,
                          isTodayDate && styles.dayToday,
                          completionStyle
                        ]}
                      >
                        <Text style={[
                          styles.dayNumber,
                          !isCurrentMonth && styles.dayNumberOtherMonth,
                          hasBackground && styles.dayNumberHighlighted
                        ]}>
                          {day.date.getDate()}
                        </Text>
                        {stats && stats.total > 0 && (
                          <View style={styles.dots}>
                            {Array.from({ length: Math.min(5, stats.completed) }).map((_, i) => (
                              <View key={i} style={[styles.dot, hasBackground && styles.dotHighlighted]} />
                            ))}
                            {stats.completed > 5 && (
                              <Text style={[styles.dotPlus, hasBackground && styles.dotPlusHighlighted]}>+</Text>
                            )}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={showLegend}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLegend(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLegend(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.legendModal}>
              <View style={styles.legendHeader}>
                <Text style={styles.legendTitle}>Legenda</Text>
                <TouchableOpacity onPress={() => setShowLegend(false)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.legendItems}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendCircle, { backgroundColor: '#00FF00' }]} />
                  <Text style={styles.legendText}>100% - Giorno perfetto</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendCircle, { backgroundColor: '#FF8C00' }]} />
                  <Text style={styles.legendText}>75%+ - Buon progresso</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendCircle, { backgroundColor: '#FFD700' }]} />
                  <Text style={styles.legendText}>50%+ - Progresso medio</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendCircle, { backgroundColor: '#FF0000' }]} />
                  <Text style={styles.legendText}>Sotto il 50%</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000', paddingHorizontal: 16 },
  header: { marginTop: 16, marginBottom: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold' },
  infoButton: { marginLeft: 12, marginTop: 4 },
  infoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  infoText: {
    color: '#9CA3AF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  monthNav: { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  monthYear: { color: '#9CA3AF', fontSize: 20, fontWeight: '600' },
  monthYearActive: { color: '#FF0000' },
  scrollView: { flex: 1 },
  scrollContent: { 
    paddingBottom: 100,
    paddingTop: 100,
  },
  calendarMonth: { minHeight: 400, marginBottom: 5 },

  calendar: { marginBottom: 5 },
  weekHeader: { flexDirection: 'row', marginBottom: 12 },
  dayHeaderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dayHeader: { color: '#9CA3AF', textAlign: 'center', fontSize: 12, fontWeight: '500' },
  
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { 
    width: '14.28%', // 100 / 7
    aspectRatio: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderRadius: 4,
    position: 'relative',
    marginBottom: 4,
  },
  dayOtherMonth: { opacity: 0.25 },
  dayToday: { borderWidth: 2, borderColor: '#FFFFFF' },
  
  dayNumber: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  dayNumberOtherMonth: { color: '#9CA3AF' },
  dayNumberHighlighted: { color: '#FFFFFF' },
  
  dots: { position: 'absolute', bottom: 3, flexDirection: 'row', gap: 2, alignItems: 'center' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#9CA3AF' },
  dotHighlighted: { backgroundColor: '#FFFFFF' },
  dotPlus: { color: '#9CA3AF', fontSize: 8, marginLeft: 1 },
  dotPlusHighlighted: { color: '#FFFFFF' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendModal: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#333333',
  },
  legendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  legendTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#9CA3AF',
    fontSize: 24,
    fontWeight: '300',
  },
  legendItems: { gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendCircle: { width: 20, height: 20, borderRadius: 10 },
  legendText: { color: '#E5E7EB', fontSize: 15 },
});


