import { getCalendarDays, getMonthName, getMonthYear, isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const STREAK_BORDER_COLOR = '#FFD700';
const STREAK_BORDER_THICKNESS = 2;
const STREAK_BORDER_INSET = 0.1;
const STREAK_VERTICAL_INSET = 0;
const STREAK_LINE_EXTEND = 8;
const DAY_BORDER_RADIUS = 8;
const STREAK_EDGE_CLIP = DAY_BORDER_RADIUS - 1;

type CompletionLevel = 'perfect' | 'good' | 'medium' | 'low';

const TEST_STREAK_DATES = [
  '2025-11-01',
  '2025-11-02',
  '2025-11-03',
  '2025-11-04',
  '2025-11-05',
  '2025-11-06',
  '2025-11-07',
  '2025-11-08',
  '2025-11-09',
  '2025-11-10',
  '2025-11-11',
  '2025-11-12',
  '2025-11-13',
  '2025-11-14',
  '2025-11-15',
  '2025-11-16',
  '2025-11-17',
  '2025-11-18',
  '2025-11-19',
  '2025-11-20',
  '2025-11-21',
  '2025-11-22',
  '2025-11-23',
  '2025-11-24',
  '2025-11-25',
  '2025-11-26',
  '2025-11-27',
  '2025-11-28',
  '2025-11-29',
  '2025-11-30',
];

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
    case 'perfect': return { backgroundColor: 'rgba(0, 255, 0, 0.5)' }; // bright green 50% transparent
    case 'good': return { backgroundColor: 'rgba(255, 140, 0, 0.5)' }; // orange 50% transparent
    case 'medium': return { backgroundColor: 'rgba(255, 215, 0, 0.5)' }; // yellow 50% transparent
    case 'low': return isPast ? { backgroundColor: 'rgba(255, 0, 0, 0.5)' } : {}; // red 50% transparent only for past days
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

  React.useEffect(() => {
    if (habits.length === 0) return;
    setTestCompletions(prev => {
      let changed = false;
      const next = { ...prev };
      TEST_STREAK_DATES.forEach(date => {
        const existing = next[date];
        if (!existing || existing.completed !== habits.length || existing.total !== habits.length) {
          next[date] = { completed: habits.length, total: habits.length };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [habits.length]);
  
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

  // Calcola le streak di almeno 7 giorni con 100% completamento
  const streakInfo = useMemo(() => {
    const streakMap = new Map<string, 'start' | 'middle' | 'end' | 'single'>();
    if (habits.length === 0) return streakMap;

    const allDates = new Set<string>();
    Object.keys(recentHistory).forEach(d => allDates.add(d));
    Object.keys(testCompletions).forEach(d => allDates.add(d));

    const sortedDates = Array.from(allDates).sort();
    if (sortedDates.length === 0) return streakMap;

    const getCompletedForDate = (date: string) => {
      const testCompletion = testCompletions[date];
      if (testCompletion) return testCompletion.completed;
      const completion = recentHistory[date];
      return completion ? Object.values(completion.completedByHabitId).filter(Boolean).length : 0;
    };

    let currentStreak: string[] = [];

    const registerStreak = (streak: string[]) => {
      if (streak.length < 1) return;
      if (streak.length === 1) {
        streakMap.set(streak[0], 'single');
        return;
      }
      streak.forEach((date, idx) => {
        if (idx === 0) streakMap.set(date, 'start');
        else if (idx === streak.length - 1) streakMap.set(date, 'end');
        else streakMap.set(date, 'middle');
      });
    };

    for (let i = 0; i < sortedDates.length; i++) {
      const date = sortedDates[i];
      const completed = getCompletedForDate(date);
      const total = habits.length;
      const isPerfect = total > 0 && completed === total;

      if (isPerfect) {
        if (currentStreak.length === 0) {
          currentStreak.push(date);
        } else {
          const lastDate = new Date(currentStreak[currentStreak.length - 1]);
          const currentDate = new Date(date);
          const diffDays = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentStreak.push(date);
          } else {
            if (currentStreak.length >= 7) registerStreak(currentStreak);
            currentStreak = [date];
          }
        }
      } else {
        if (currentStreak.length >= 7) registerStreak(currentStreak);
        currentStreak = [];
      }
    }

    if (currentStreak.length >= 7) registerStreak(currentStreak);

    return streakMap;
  }, [recentHistory, testCompletions, habits.length]);

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
            <View key={`${year}-${month}`} style={[styles.calendarMonth, monthIndex === 0 && { marginTop: -80 }]}>
              <View style={styles.monthNav}>
                <View style={[styles.monthLabel, isCurrentMonthActive && styles.monthLabelActive]}>
                  <Text style={[styles.monthYear, isCurrentMonthActive && styles.monthYearActive]}>
                    {getMonthName(month)} {year}
                  </Text>
                </View>
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
                  const streakPosition = streakInfo.get(day.ymd);
                  const rowIndex = Math.floor(index / 7);
                  const prevDay = days[index - 1];
                  const nextDay = days[index + 1];
                  const prevRowIndex = prevDay !== undefined ? Math.floor((index - 1) / 7) : -1;
                  const nextRowIndex = nextDay !== undefined ? Math.floor((index + 1) / 7) : -1;
                  const prevStreakPosition = prevDay ? streakInfo.get(prevDay.ymd) : undefined;
                  const nextStreakPosition = nextDay ? streakInfo.get(nextDay.ymd) : undefined;
                  const connectLeft = !!prevStreakPosition && prevRowIndex === rowIndex;
                  const connectRight = !!nextStreakPosition && nextRowIndex === rowIndex;
                  const streakLines: React.ReactNode[] = [];

                  if (streakPosition) {
                    const baseHorizontalStyle = {
                      left: STREAK_BORDER_INSET - (connectLeft ? STREAK_LINE_EXTEND : 0),
                      right: STREAK_BORDER_INSET - (connectRight ? STREAK_LINE_EXTEND : 0),
                    };
                    const topSegments: React.ReactNode[] = [];
                    const bottomSegments: React.ReactNode[] = [];

                    const pushHorizontalSegments = (
                      keySuffix: string,
                      overrides: { left?: number; right?: number } = {}
                    ) => {
                      topSegments.push(
                        <View
                          key={`streak-top-${keySuffix}`}
                          pointerEvents="none"
                          style={[styles.streakLineBase, styles.streakLineTop, { ...baseHorizontalStyle, ...overrides }]}
                        />
                      );
                      bottomSegments.push(
                        <View
                          key={`streak-bottom-${keySuffix}`}
                          pointerEvents="none"
                          style={[styles.streakLineBase, styles.streakLineBottom, { ...baseHorizontalStyle, ...overrides }]}
                        />
                      );
                    };

                    const shrinkLeft = STREAK_LINE_EXTEND;
                    const shrinkRight = STREAK_LINE_EXTEND;

                    if (streakPosition === 'start') {
                      pushHorizontalSegments('start', {
                        left: STREAK_BORDER_INSET + STREAK_EDGE_CLIP,
                        right: baseHorizontalStyle.right,
                      });
                    } else if (streakPosition === 'end') {
                      pushHorizontalSegments('end', {
                        left: baseHorizontalStyle.left,
                        right: STREAK_BORDER_INSET + STREAK_EDGE_CLIP,
                      });
                    } else if (streakPosition === 'single') {
                      pushHorizontalSegments('single', {
                        left: STREAK_BORDER_INSET + STREAK_EDGE_CLIP,
                        right: STREAK_BORDER_INSET + STREAK_EDGE_CLIP,
                      });
                    } else {
                      pushHorizontalSegments('middle');
                    }

                    streakLines.push(...topSegments, ...bottomSegments);
                    if (streakPosition === 'start' || streakPosition === 'single') {
                      const showVertical = streakPosition === 'single';
                      if (showVertical) {
                        streakLines.push(
                          <View
                            key="streak-left"
                            pointerEvents="none"
                            style={[styles.streakLineBase, styles.streakLineLeft]}
                          />
                        );
                      }
                      streakLines.push(
                        <View
                          key="streak-left"
                          pointerEvents="none"
                          style={[
                            styles.streakCornerBase,
                            styles.streakCornerLeft,
                            showVertical && styles.streakCornerEdgeLeft,
                          ]}
                        />
                      );
                    }
                    if (streakPosition === 'end' || streakPosition === 'single') {
                      const showVertical = streakPosition === 'single';
                      if (showVertical) {
                        streakLines.push(
                          <View
                            key="streak-right"
                            pointerEvents="none"
                            style={[styles.streakLineBase, styles.streakLineRight]}
                          />
                        );
                      }
                      streakLines.push(
                        <View
                          key="streak-right"
                          pointerEvents="none"
                          style={[
                            styles.streakCornerBase,
                            styles.streakCornerRight,
                            showVertical && styles.streakCornerEdgeRight,
                          ]}
                        />
                      );
                    }
                  }
                    return (
                      <View key={index} style={styles.dayCellWrapper}>
                      {streakLines}
                        <TouchableOpacity
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
                      </View>
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
                  <View style={[styles.legendCircle, { backgroundColor: 'rgba(0, 255, 0, 0.5)' }]} />
                  <Text style={styles.legendText}>100% - Giorno perfetto</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendCircle, { backgroundColor: 'rgba(255, 140, 0, 0.5)' }]} />
                  <Text style={styles.legendText}>75%+ - Buon progresso</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendCircle, { backgroundColor: 'rgba(255, 215, 0, 0.5)' }]} />
                  <Text style={styles.legendText}>50%+ - Progresso medio</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendCircle, { backgroundColor: 'rgba(255, 0, 0, 0.5)' }]} />
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
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', fontStyle: 'italic', letterSpacing: -1 },
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

  monthNav: { alignItems: 'flex-start', justifyContent: 'center', marginBottom: 14, width: '100%' },
  monthLabel: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    paddingHorizontal: 22,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 3,
    borderColor: '#000000',
    transform: [{ skewX: '-16deg' }],
  },
  monthLabelActive: {
    borderWidth: 4,
    paddingHorizontal: 26,
    paddingVertical: 7,
  },
  monthYear: { 
    color: '#FF1400', 
    fontSize: 22, 
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    textAlign: 'left',
    letterSpacing: -1,
    transform: [{ skewX: '12deg' }, { scaleX: 0.8 }, { scaleY: 1.08 }],
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  monthYearActive: { 
    letterSpacing: -1.2,
  },
  scrollView: { flex: 1 },
  scrollContent: { 
    paddingBottom: 100,
    paddingTop: 100,
  },
  calendarMonth: { minHeight: 400, marginBottom: -85 },

  calendar: { marginBottom: 5 },
  weekHeader: { flexDirection: 'row', marginBottom: 12 },
  dayHeaderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dayHeader: { color: '#9CA3AF', textAlign: 'center', fontSize: 12, fontWeight: '500' },
  
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  dayCellWrapper: {
    width: '14.28%', // 100 / 7
    position: 'relative',
    transform: [{ scale: 0.93 }],
  },
  dayCell: { 
    width: '100%',
    aspectRatio: 1.3, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  dayOtherMonth: { opacity: 0.25 },
  dayToday: { borderWidth: 2, borderColor: '#FFFFFF' },
  streakLineBase: {
    position: 'absolute',
    backgroundColor: STREAK_BORDER_COLOR,
    borderRadius: STREAK_BORDER_THICKNESS / 2,
    zIndex: 11,
  },
  streakLineTop: {
    top: STREAK_BORDER_INSET,
    left: STREAK_BORDER_INSET,
    right: STREAK_BORDER_INSET,
    height: STREAK_BORDER_THICKNESS,
  },
  streakLineBottom: {
    bottom: -STREAK_BORDER_INSET,
    left: STREAK_BORDER_INSET,
    right: STREAK_BORDER_INSET,
    height: STREAK_BORDER_THICKNESS,
  },
  streakLineLeft: {
    top: STREAK_BORDER_INSET,
    bottom: -STREAK_BORDER_INSET,
    left: STREAK_VERTICAL_INSET,
    width: STREAK_BORDER_THICKNESS,
  },
  streakLineRight: {
    top: STREAK_BORDER_INSET,
    bottom: -STREAK_BORDER_INSET,
    right: STREAK_VERTICAL_INSET,
    width: STREAK_BORDER_THICKNESS,
  },
  streakCornerBase: {
    position: 'absolute',
    zIndex: 12,
    borderColor: STREAK_BORDER_COLOR,
    borderStyle: 'solid',
  },
  streakCornerLeft: {
    left: STREAK_VERTICAL_INSET,
    top: STREAK_BORDER_INSET,
    bottom: -STREAK_BORDER_INSET,
    borderLeftWidth: STREAK_BORDER_THICKNESS,
    borderTopWidth: STREAK_BORDER_THICKNESS,
    borderBottomWidth: STREAK_BORDER_THICKNESS,
    borderRightWidth: 0,
    borderTopLeftRadius: DAY_BORDER_RADIUS,
    borderBottomLeftRadius: DAY_BORDER_RADIUS,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    width: DAY_BORDER_RADIUS + STREAK_BORDER_INSET,
  },
  streakCornerRight: {
    right: STREAK_VERTICAL_INSET,
    top: STREAK_BORDER_INSET,
    bottom: -STREAK_BORDER_INSET,
    borderRightWidth: STREAK_BORDER_THICKNESS,
    borderTopWidth: STREAK_BORDER_THICKNESS,
    borderBottomWidth: STREAK_BORDER_THICKNESS,
    borderLeftWidth: 0,
    borderTopRightRadius: DAY_BORDER_RADIUS,
    borderBottomRightRadius: DAY_BORDER_RADIUS,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    width: DAY_BORDER_RADIUS + STREAK_BORDER_INSET,
  },
  streakCornerEdgeLeft: {
    borderLeftWidth: 0,
  },
  streakCornerEdgeRight: {
    borderRightWidth: 0,
  },
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


