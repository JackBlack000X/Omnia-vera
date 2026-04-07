import { getCalendarDays, getMonthName, getMonthYear } from '@/lib/date';
import { getHabitsAppearingOnDate } from '@/lib/habits/habitsForDate';
import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { useAppTheme } from '@/lib/theme-context';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const STREAK_BORDER_COLOR = '#FFD700';
const STREAK_BORDER_THICKNESS = 2;
const STREAK_BORDER_INSET = 0.1;
const STREAK_VERTICAL_INSET = 0;
const STREAK_LINE_EXTEND = 8;
const DAY_BORDER_RADIUS = 8;
const STREAK_EDGE_CLIP = DAY_BORDER_RADIUS - 1;

/** Riferimento stabile: evita che la nativa riparsifici / resetti la Lottie a ogni re-render. */
const STREAK_FLAME_LOTTIE_SOURCE = require('@/assets/animations/fire.json');

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
    case 'perfect': return { backgroundColor: 'rgba(0, 255, 0, 0.5)' }; // bright green 50% transparent
    case 'good': return { backgroundColor: 'rgba(255, 140, 0, 0.5)' }; // orange 50% transparent
    case 'medium': return { backgroundColor: 'rgba(255, 215, 0, 0.5)' }; // yellow 50% transparent
    case 'low': return isPast ? { backgroundColor: 'rgba(255, 0, 0, 0.5)' } : {}; // red 50% transparent only for past days
  }
}

const StreakFlameLottie = React.memo(function StreakFlameLottie() {
  return (
    <View style={styles.streakFlameWrap} pointerEvents="none" collapsable={false}>
      <LottieView
        source={STREAK_FLAME_LOTTIE_SOURCE}
        loop
        autoPlay
        resizeMode="contain"
        renderMode="SOFTWARE"
        style={styles.streakFlameLottie}
      />
    </View>
  );
});

type MonthData = { year: number; month: number; date: Date; numWeeks: number };

type MonthViewProps = {
  item: MonthData;
  isCurrentMonthActive: boolean;
  logicalTodayYmd: string;
  habits: Habit[];
  recentHistory: Record<string, { date: string; completedByHabitId: Record<string, boolean> }>;
  streakInfo: Map<string, 'start' | 'middle' | 'end' | 'single'>;
  onDayPress: (day: { date: Date; isCurrentMonth: boolean; ymd: string }) => void;
  isFirst: boolean;
  dayResetTime?: string;
};

const MonthView = React.memo(function MonthView({
  item, isCurrentMonthActive, logicalTodayYmd, habits, recentHistory, streakInfo, onDayPress, isFirst, dayResetTime
}: MonthViewProps) {
  const { year, month } = item;
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const dayStats = useMemo(() => {
    const stats: Record<string, { completed: number; total: number; level: CompletionLevel }> = {};
    for (const day of days) {
      const habitsForDay = getHabitsAppearingOnDate(habits, day.ymd, dayResetTime);
      const total = habitsForDay.length;
      let completed: number;
      const completion = recentHistory[day.ymd];
      if (completion) {
        completed = habitsForDay.filter((h) => completion.completedByHabitId[h.id]).length;
      } else {
        completed = 0;
      }
      const isTodayYmd = day.ymd === logicalTodayYmd;
      const level = isTodayYmd ? 'low' : getCompletionLevel(completed, total);
      stats[day.ymd] = { completed, total, level };
    }
    return stats;
  }, [days, habits, recentHistory, logicalTodayYmd, dayResetTime]);

  return (
    <View style={[styles.calendarMonth, isFirst && { marginTop: 4 }]}>
      <View style={styles.monthNav}>
        <View style={[styles.monthLabel, isCurrentMonthActive && styles.monthLabelActive]}>
          <Text
            style={[styles.monthYear, isCurrentMonthActive && styles.monthYearActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
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
            const isTodayDate = day.ymd === logicalTodayYmd;
            const isPast = day.ymd < logicalTodayYmd;
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
                  <View key={`streak-top-${keySuffix}`} pointerEvents="none"
                    style={[styles.streakLineBase, styles.streakLineTop, { ...baseHorizontalStyle, ...overrides }]} />
                );
                bottomSegments.push(
                  <View key={`streak-bottom-${keySuffix}`} pointerEvents="none"
                    style={[styles.streakLineBase, styles.streakLineBottom, { ...baseHorizontalStyle, ...overrides }]} />
                );
              };

              if (streakPosition === 'start') {
                pushHorizontalSegments('start', { left: STREAK_BORDER_INSET + STREAK_EDGE_CLIP, right: baseHorizontalStyle.right });
              } else if (streakPosition === 'end') {
                pushHorizontalSegments('end', { left: baseHorizontalStyle.left, right: STREAK_BORDER_INSET + STREAK_EDGE_CLIP });
              } else if (streakPosition === 'single') {
                pushHorizontalSegments('single', { left: STREAK_BORDER_INSET + STREAK_EDGE_CLIP, right: STREAK_BORDER_INSET + STREAK_EDGE_CLIP });
              } else {
                pushHorizontalSegments('middle');
              }

              streakLines.push(...topSegments, ...bottomSegments);
              if (streakPosition === 'start' || streakPosition === 'single') {
                const showVertical = streakPosition === 'single';
                if (showVertical) {
                  streakLines.push(<View key="streak-left" pointerEvents="none" style={[styles.streakLineBase, styles.streakLineLeft]} />);
                }
                streakLines.push(<View key="streak-corner-left" pointerEvents="none"
                  style={[styles.streakCornerBase, styles.streakCornerLeft, showVertical && styles.streakCornerEdgeLeft]} />);
              }
              if (streakPosition === 'end' || streakPosition === 'single') {
                const showVertical = streakPosition === 'single';
                if (showVertical) {
                  streakLines.push(<View key="streak-right" pointerEvents="none" style={[styles.streakLineBase, styles.streakLineRight]} />);
                }
                streakLines.push(<View key="streak-corner-right" pointerEvents="none"
                  style={[styles.streakCornerBase, styles.streakCornerRight, showVertical && styles.streakCornerEdgeRight]} />);
              }
            }

            return (
              <View key={index} style={styles.dayCellWrapper}>
                {streakLines}
                <TouchableOpacity
                  onPress={() => onDayPress(day)}
                  style={[styles.dayCell, !isCurrentMonth && styles.dayOtherMonth, isTodayDate && styles.dayToday, completionStyle]}
                >
                  <Text style={[styles.dayNumber, !isCurrentMonth && styles.dayNumberOtherMonth, hasBackground && styles.dayNumberHighlighted]}>
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
});

function getNumWeeksInMonth(year: number, month: number): number {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const firstDayOfWeekMon = (firstDay.getDay() + 6) % 7;
  return Math.ceil((firstDayOfWeekMon + lastDay.getDate()) / 7);
}

export default function CalendarScreen() {
  const { habits, history, getDay, dayResetTime } = useHabits();
  const { activeTheme } = useAppTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const logicalTodayYmd = useMemo(
    () => getDay(new Date()),
    [getDay]
  );
  const logicalTodayDate = useMemo(
    () => new Date(`${logicalTodayYmd}T12:00:00.000Z`),
    [logicalTodayYmd]
  );
  const { year: currentYear, month: currentMonth } = useMemo(
    () => getMonthYear(logicalTodayDate),
    [logicalTodayDate]
  );

  const earliestMonthWithHistory = useMemo(() => {
    const dates = Object.keys(history);
    if (dates.length === 0) {
      return { year: currentYear, month: currentMonth };
    }
    const sorted = dates.slice().sort();
    const first = sorted[0];
    const [yStr, mStr] = first.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    if (!year || !month) {
      return { year: currentYear, month: currentMonth };
    }
    if (year > currentYear || (year === currentYear && month > currentMonth)) {
      return { year: currentYear, month: currentMonth };
    }
    return { year, month };
  }, [history, currentYear, currentMonth]);

  const [showLegend, setShowLegend] = useState(false);

  const allMonths = useMemo((): MonthData[] => {
    const months: MonthData[] = [];
    const startDate = new Date(earliestMonthWithHistory.year, earliestMonthWithHistory.month - 1, 1);
    const endDate = new Date(currentYear + 10, currentMonth - 1, 1);
    for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      const { year, month } = getMonthYear(d);
      months.push({ year, month, date: new Date(d), numWeeks: getNumWeeksInMonth(year, month) });
    }
    return months;
  }, [earliestMonthWithHistory, currentYear, currentMonth]);

  // Compute accurate per-month heights based on screen width for getItemLayout
  const dayCellHeight = useMemo(() => (screenWidth / 7) / 1.3, [screenWidth]);
  const MONTH_OVERHEAD = 117; // monthNav + weekHeader + margins

  const monthHeights = useMemo(
    () => allMonths.map(m => MONTH_OVERHEAD + m.numWeeks * dayCellHeight),
    [allMonths, dayCellHeight]
  );

  const monthOffsets = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < monthHeights.length - 1; i++) {
      offsets.push(offsets[i] + monthHeights[i]);
    }
    return offsets;
  }, [monthHeights]);

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: monthHeights[index] ?? MONTH_OVERHEAD + 5 * dayCellHeight,
    offset: monthOffsets[index] ?? index * (MONTH_OVERHEAD + 5 * dayCellHeight),
    index,
  }), [monthHeights, monthOffsets, dayCellHeight]);

  const initialMonthIndex = useMemo(
    () => allMonths.findIndex(m => m.year === currentYear && m.month === currentMonth),
    [allMonths, currentYear, currentMonth]
  );

  // Keep only last 90 days of history (include today so calendar shows today's real %)
  const recentHistory = useMemo(() => {
    const cutoff = new Date(logicalTodayDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered: typeof history = {};
    for (const [date, completion] of Object.entries(history)) {
      if (date >= cutoffStr && date <= logicalTodayYmd) filtered[date] = completion;
    }
    return filtered;
  }, [history, logicalTodayDate, logicalTodayYmd]);

  const streakInfo = useMemo(() => {
    const streakMap = new Map<string, 'start' | 'middle' | 'end' | 'single'>();
    if (habits.length === 0) return streakMap;

    const allDates = new Set<string>();
    Object.keys(recentHistory).forEach(d => allDates.add(d));
    const sortedDates = Array.from(allDates).sort();
    if (sortedDates.length === 0) return streakMap;

    const getCompletedForDate = (date: string) => {
      const completion = recentHistory[date];
      const habitsForDay = getHabitsAppearingOnDate(habits, date, dayResetTime);
      if (completion) return habitsForDay.filter((h) => completion.completedByHabitId[h.id]).length;
      return 0;
    };

    const getTotalForDate = (date: string) => getHabitsAppearingOnDate(habits, date, dayResetTime).length;

    let currentStreak: string[] = [];
    const registerStreak = (streak: string[]) => {
      if (streak.length < 1) return;
      if (streak.length === 1) { streakMap.set(streak[0], 'single'); return; }
      streak.forEach((date, idx) => {
        if (idx === 0) streakMap.set(date, 'start');
        else if (idx === streak.length - 1) streakMap.set(date, 'end');
        else streakMap.set(date, 'middle');
      });
    };

    for (let i = 0; i < sortedDates.length; i++) {
      const date = sortedDates[i];
      // Non considerare il giorno \"aperto\" (oggi) nella streak
      if (date === logicalTodayYmd) continue;
      const totalForDay = getTotalForDate(date);
      const isPerfect = totalForDay > 0 && getCompletedForDate(date) === totalForDay;
      if (isPerfect) {
        if (currentStreak.length === 0) {
          currentStreak.push(date);
        } else {
          const lastDate = new Date(currentStreak[currentStreak.length - 1]);
          const diffDays = Math.floor((new Date(date).getTime() - lastDate.getTime()) / 86400000);
          if (diffDays === 1) { currentStreak.push(date); }
          else { if (currentStreak.length >= 2) registerStreak(currentStreak); currentStreak = [date]; }
        }
      } else {
        if (currentStreak.length >= 2) registerStreak(currentStreak);
        currentStreak = [];
      }
    }
    if (currentStreak.length >= 2) registerStreak(currentStreak);
    return streakMap;
  }, [recentHistory, habits, logicalTodayYmd, dayResetTime]);

  const currentPerfectStreak = useMemo(() => {
    // Use real history + per-day habits so streak matches tasks tab
    const perfectDates: string[] = [];
    for (const [ymd, completion] of Object.entries(recentHistory)) {
      // Conta solo i giorni COMPLETAMENTE chiusi (prima dell'oggi logico)
      if (ymd >= logicalTodayYmd) continue;
      const habitsForDay = getHabitsAppearingOnDate(habits, ymd, dayResetTime);
      const total = habitsForDay.length;
      if (total === 0) continue;
      const completed = habitsForDay.filter((h) => completion.completedByHabitId[h.id]).length;
      if (completed === total) perfectDates.push(ymd);
    }
    perfectDates.sort().reverse();

    if (perfectDates.length === 0) return 0;

    let streak = 0;
    let prevDate: Date | null = null;

    for (const ymd of perfectDates) {
      const d = new Date(ymd + 'T12:00:00Z');
      if (!prevDate) {
        streak = 1;
        prevDate = d;
        continue;
      }
      const diffDays = Math.round((prevDate.getTime() - d.getTime()) / 86400000);
      if (diffDays !== 1) break;
      streak += 1;
      prevDate = d;
    }

    return streak;
  }, [recentHistory, habits, logicalTodayYmd, dayResetTime]);

  const handleDayPress = useCallback((day: { date: Date; isCurrentMonth: boolean; ymd: string }) => {
    // Vai alla tab OGGI mostrando la timeline di quel giorno specifico
    router.push({ pathname: '/oggi', params: { ymd: day.ymd } });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: MonthData; index: number }) => (
    <MonthView
      item={item}
      isCurrentMonthActive={item.year === currentYear && item.month === currentMonth}
      logicalTodayYmd={logicalTodayYmd}
      habits={habits}
      recentHistory={recentHistory}
      streakInfo={streakInfo}
      onDayPress={handleDayPress}
      isFirst={index === 0}
      dayResetTime={dayResetTime}
    />
  ), [currentYear, currentMonth, logicalTodayYmd, habits, recentHistory, streakInfo, handleDayPress, dayResetTime]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 60 }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            {activeTheme !== 'futuristic' && (
              <View style={styles.headerTitleRow}>
                <Text style={styles.title}>Calendario Abitudini</Text>
                <TouchableOpacity onPress={() => setShowLegend(true)} style={styles.infoButtonInline}>
                  <View style={styles.infoCircleSmall}>
                    <Text style={styles.infoTextSmall}>i</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={styles.streakBadge}>
              <Text style={styles.streakValue}>{currentPerfectStreak}</Text>
              <View style={styles.streakFlameSpacer} />
              <StreakFlameLottie />
            </View>
            {activeTheme === 'futuristic' && (
              <TouchableOpacity onPress={() => setShowLegend(true)} style={styles.infoButton}>
                <View style={styles.infoCircle}>
                  <Text style={styles.infoText}>i</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <FlatList
        data={allMonths}
        keyExtractor={(item) => `${item.year}-${item.month}`}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialMonthIndex >= 0 ? initialMonthIndex : 0}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={3}
      />

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
  screen: { flex: 1, backgroundColor: '#000', paddingHorizontal: 0 },
  header: { marginTop: 15, marginBottom: 15, paddingHorizontal: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', letterSpacing: -1 },
  infoButton: { marginLeft: 12, marginTop: 4 },
  infoButtonInline: { marginLeft: 2 },
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
  infoCircleSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    transform: [{ translateY: 2 }],
  },
  infoTextSmall: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  streakFlameSpacer: {
    width: 0,
  },
  streakFlameWrap: {
    width: 26.4,
    height: 26.4,
    marginTop: 0,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  streakFlameLottie: {
    width: 24.2,
    height: 30.8,
    marginTop: -5,
  },
  streakValue: {
    color: '#FFD700',
    fontSize: 26,
    fontFamily: 'BagelFatOne_400Regular',
  },

  monthNav: { justifyContent: 'center', marginBottom: 14, width: '100%' },
  monthLabel: {
    width: '100%',
    paddingLeft: 5,
  },
  monthLabelActive: {
  },
  monthYear: { 
    color: '#FF1400', 
    fontSize: 22, 
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    textAlign: 'left',
    letterSpacing: -1,
    alignSelf: 'stretch',
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  monthYearActive: { 
    letterSpacing: -1.2,
  },
  scrollContent: { 
    paddingBottom: 100,
    paddingTop: 20,
  },
  calendarMonth: { marginBottom: 32 },

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
