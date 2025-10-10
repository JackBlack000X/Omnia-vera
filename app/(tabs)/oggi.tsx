import { THEME } from '@/constants/theme';
import { isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

function isLightColor(hex: string): boolean {
  const c = (hex || '').toLowerCase();
  if (!c.startsWith('#') || (c.length !== 7 && c.length !== 4)) return false;
  let r: number, g: number, b: number;
  if (c.length === 7) {
    r = parseInt(c.slice(1, 3), 16);
    g = parseInt(c.slice(3, 5), 16);
    b = parseInt(c.slice(5, 7), 16);
  } else {
    r = parseInt(c[1] + c[1], 16);
    g = parseInt(c[2] + c[2], 16);
    b = parseInt(c[3] + c[3], 16);
  }
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l >= 140;
}

// No mock events: we render real habits as events

export default function OggiScreen() {
  const { habits, history, getDay } = useHabits();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [windowStart, setWindowStart] = useState<string>('06:00');
  const [windowEnd, setWindowEnd] = useState<string>('22:00');
  const [visibleHours, setVisibleHours] = useState<number>(7);
  
  const today = getDay(currentDate);

  const todayDate = useMemo(() => {
    return formatDateLong(currentDate, TZ);
  }, [currentDate]);

  const todayStats = useMemo(() => {
    const total = habits.length;
    const completed = history[today]?.completedByHabitId ?? {};
    const done = Object.values(completed).filter(Boolean).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [habits, history, today]);

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date());
    };
    
    // Update immediately
    updateTime();
    
    // Set up interval to update every minute
    const interval = setInterval(updateTime, 60000); // 60000ms = 1 minute
    
    return () => clearInterval(interval);
  }, []);

  // Load/save viewing window
  useEffect(() => {
    (async () => {
      try {
        const [start, end, vis] = await Promise.all([
          AsyncStorage.getItem('oggi_window_start_v1'),
          AsyncStorage.getItem('oggi_window_end_v1'),
          AsyncStorage.getItem('oggi_visible_hours_v1'),
        ]);
        if (start) setWindowStart(start);
        if (end) setWindowEnd(end);
        const v = vis ? parseInt(vis, 10) : NaN;
        if (!isNaN(v)) setVisibleHours(Math.min(24, Math.max(5, v)));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('oggi_window_start_v1', windowStart).catch(() => {});
  }, [windowStart]);
  useEffect(() => {
    AsyncStorage.setItem('oggi_window_end_v1', windowEnd).catch(() => {});
  }, [windowEnd]);
  useEffect(() => {
    AsyncStorage.setItem('oggi_visible_hours_v1', String(visibleHours)).catch(() => {});
  }, [visibleHours]);


  const toMinutes = (hhmm: string) => {
    if (hhmm === '24:00') return 1440;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const windowStartMin = toMinutes(windowStart);
  const windowEndMin = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  // Dynamic scale: pixels per minute = hourRowHeight / 60
  const clampedVisibleHours = Math.max(5, Math.min(24, visibleHours));
  // Calibrated so that the visual matches the selected hours.
  // Base: 96px/hour ~ 7h. Apply a correction to eliminate the +1h offset.
  const basePerHour = 96 * (7 / clampedVisibleHours);
  const correction = (clampedVisibleHours + 1) / clampedVisibleHours; // remove ~+1h offset
  const hourRowHeight = Math.max(24, Math.min(192, basePerHour * correction));
  const scalePxPerMin = hourRowHeight / 60;

  // Generate hourly timeline based on viewing window (include end label)
  const hours = useMemo(() => {
    const startHour = Math.floor(windowStartMin / 60);
    const endHourLabel = Math.floor(windowEndMin / 60); // include end hour label
    const count = Math.max(endHourLabel - startHour + 1, 1);
    return Array.from({ length: count }, (_, i) => {
      const hour = startHour + i;
      return `${hour.toString().padStart(2, '0')}:00`;
    });
  }, [windowStartMin, windowEndMin]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const getEventPosition = (startTime: string, endTime: string) => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    const visibleStart = Math.max(startMinutes, windowStartMin);
    const visibleEnd = Math.min(endMinutes, windowEndMin);
    if (visibleEnd <= visibleStart) return { top: -1, height: 0 };

    const top = (visibleStart - windowStartMin) * scalePxPerMin;
    let height = (visibleEnd - visibleStart) * scalePxPerMin;
    // Prevent bottom edge from crossing the hour line when ending exactly on an hour
    const endsOnHour = (visibleEnd % 60) === 0;
    const bottomGapPx = 2; // adjusted gap at the bottom
    if (endsOnHour) {
      height = Math.max(20, height - bottomGapPx);
    } else {
      height = Math.max(20, height);
    }
    return { top, height };
  };

  // Calculate current time line position
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;
    
    // Check if current time is within the visible window
    if (currentMinutes < windowStartMin || currentMinutes > windowEndMin) {
      return null;
    }
    
    const top = (currentMinutes - windowStartMin) * scalePxPerMin;
    const firstLineOffset = hourRowHeight / 2; // align to the middle line of first hour row
    
    return top + firstLineOffset;
  };

  // Build events from habits for the selected day
  type OggiEvent = { id: string; title: string; startTime: string; endTime: string; isAllDay: boolean; color: string };
  const weekday = useMemo(() => {
    const d = currentDate;
    return d.getDay(); // 0=Sunday
  }, [currentDate]);
  const dayOfMonth = useMemo(() => currentDate.getDate(), [currentDate]);
  const monthIndex1 = useMemo(() => currentDate.getMonth() + 1, [currentDate]);

  const { timedEvents, allDayEvents } = useMemo(() => {
    const items: OggiEvent[] = [];
    const allDay: OggiEvent[] = [];
    for (const h of habits) {
      // Respect creation date: show only from createdAt (inclusive) onward,
      // except when there is an explicit time override for the selected date.
      const selectedYmd = getDay(currentDate);
      const hasOverrideForSelected = !!h.timeOverrides?.[selectedYmd];
      if (h.createdAt && selectedYmd < h.createdAt && !hasOverrideForSelected) {
        continue;
      }
      // Filter by schedule day
      const sched = h.schedule;
      let showToday = true;
      if (sched) {
        const dow = sched.daysOfWeek ?? [];
        const mdays = sched.monthDays ?? [];
        const yrM = sched.yearMonth ?? null;
        const yrD = sched.yearDay ?? null;
        // Our UI selects Mon..Sun mapped to 1..6,0 (Sunday)
        const weeklyApplies = dow.length === 0 || dow.includes(weekday);
        const monthlyApplies = mdays.length > 0 ? mdays.includes(dayOfMonth) : true;
        const annualApplies = yrM && yrD ? (yrM === monthIndex1 && yrD === dayOfMonth) : true;
        showToday = weeklyApplies && monthlyApplies && annualApplies;
      } else {
        // If no explicit schedule, treat as daily (appears every day)
        // The createdAt check above already ensures we only show from creation date onward
        showToday = true;
      }
      if (!showToday) continue;

      // Effective times
      const ymd = selectedYmd; // same key used for overrides
      const overrideStart = h.timeOverrides?.[ymd];
      // One-off: if no weekly/monthly selection but has overrides, show only on override date
      const schedDays = h.schedule?.daysOfWeek ?? [];
      const schedMonth = h.schedule?.monthDays ?? [];
      const isOneOff = (schedDays.length === 0 && schedMonth.length === 0 && h.timeOverrides && Object.keys(h.timeOverrides).length > 0);
      if (isOneOff && !overrideStart) {
        continue;
      }

      // Weekly per-day override time if available
      const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
      const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
      const start = overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (h.schedule?.time ?? null));
      const end = (weekly?.end ?? monthlyT?.end ?? (h.schedule?.endTime ?? null));
      const color = h.color ?? '#3b82f6';
      const title = h.text;

      if (!start && !end) {
        allDay.push({ id: h.id, title, startTime: '00:00', endTime: '24:00', isAllDay: true, color });
      } else if (start && end) {
        items.push({ id: h.id, title, startTime: start, endTime: end === '23:59' ? '24:00' : end, isAllDay: false, color });
      } else if (start && !end) {
        // Single point time -> treat as 1h block for display
        const [sh] = start.split(':').map(Number);
        const nextHour = Math.min(24, sh + 1);
        const endStr = nextHour === 24 ? '24:00' : `${String(nextHour).padStart(2, '0')}:00`;
        items.push({ id: h.id, title, startTime: `${String(sh).padStart(2, '0')}:00`, endTime: endStr, isAllDay: false, color });
      } else if (!start && end) {
        // Only end provided -> show as last hour ending at end
        const [eh] = end.split(':').map(Number);
        const startHour = Math.max(0, eh - 1);
        items.push({ id: h.id, title, startTime: `${String(startHour).padStart(2, '0')}:00`, endTime: end === '23:59' ? '24:00' : end, isAllDay: false, color });
      }
    }

    // Past/future filtering
    // Show events for any selected day (past, today, future) according to schedule/overrides
    return { timedEvents: items, allDayEvents: allDay };
  }, [habits, weekday, dayOfMonth, currentDate, getDay]);

  // Compute columns for overlapping timed events
  type LayoutInfo = { col: number; columns: number };
  const layoutById = useMemo<Record<string, LayoutInfo>>(() => {
    const events = timedEvents.map(e => {
      const [sh, sm] = e.startTime.split(':').map(Number);
      const [eh, em] = e.endTime.split(':').map(Number);
      return { ...e, s: sh * 60 + sm, e: eh * 60 + em };
    }).sort((a, b) => a.s - b.s || a.e - b.e);
    const active: Array<{ id: string; end: number; col: number; group: number }> = [];
    const takenCols: boolean[] = [];
    let currentGroup = 0;
    const groupMaxCols: Record<number, number> = {};
    const assignment: Record<string, LayoutInfo & { group: number }> = {} as any;

    for (const ev of events) {
      // Remove non-overlapping from active
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].end <= ev.s) {
          takenCols[active[i].col] = false;
          active.splice(i, 1);
        }
      }
      // New cluster if active empty
      if (active.length === 0) {
        currentGroup += 1;
        takenCols.length = 0;
      }
      // Find first free column
      let col = 0;
      while (takenCols[col]) col++;
      takenCols[col] = true;
      active.push({ id: ev.id, end: ev.e, col, group: currentGroup });
      assignment[ev.id] = { col, columns: 1, group: currentGroup };
      groupMaxCols[currentGroup] = Math.max(groupMaxCols[currentGroup] ?? 0, col + 1);
    }
    // Assign group column counts
    Object.keys(assignment).forEach(id => {
      const grp = assignment[id].group;
      assignment[id].columns = groupMaxCols[grp] ?? 1;
    });
    const out: Record<string, LayoutInfo> = {};
    Object.entries(assignment).forEach(([id, v]) => { out[id] = { col: v.col, columns: v.columns }; });
    return out;
  }, [timedEvents]);

  const renderEvent = (event: typeof mockEvents[0]) => {
    if (event.isAllDay) {
      return (
        <View key={event.id} style={styles.allDayEvent}>
          <View style={styles.allDayDot} />
          <View style={[styles.eventBlock, { backgroundColor: event.color }]}>
            <Text style={styles.eventTitle}>{event.title}</Text>
          </View>
        </View>
      );
    }

    const { top, height } = getEventPosition(event.startTime, event.endTime);
    if (top < 0 || height <= 0) return null;
    const screenWidth = Dimensions.get('window').width;
    const baseLeft = 65;
    const availableWidth = Math.max(0, screenWidth - baseLeft);
    const layout = layoutById[event.id] ?? { col: 0, columns: 1 };
    const colWidth = availableWidth / layout.columns;
    const spacing = layout.columns > 1 ? 2 : 0; // 2px spacing between overlapping events
    const leftPx = baseLeft + layout.col * colWidth + (layout.col * spacing);
    const widthPx = Math.max(0, colWidth - spacing);

    // Dynamically compute hour row height to approximate showing `visibleHours` at once.
    // Baseline: 96px per hour shows ~7 hours.
    const hourRowHeight = Math.max(24, Math.min(192, 96 * (7 / Math.max(5, Math.min(24, visibleHours)))));
    const firstLineOffset = hourRowHeight / 2; // align to the middle line of first hour row

    const light = isLightColor(event.color);
    return (
      <View
        key={event.id}
        style={[
          styles.timedEvent,
          {
            top: top + firstLineOffset,
            height: Math.max(height, 20),
            backgroundColor: event.color,
            left: leftPx,
            width: widthPx,
          }
        ]}
      >
        <Text style={[styles.eventTitle, light ? { color: '#111111' } : { color: THEME.text }]}>{event.title}</Text>
        <Text style={[styles.eventTime, light ? { color: '#111111' } : { color: THEME.text }]}>{event.startTime} - {event.endTime}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateDate('prev')} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={[styles.dateText, isToday(currentDate, TZ) ? styles.todayDateText : styles.otherDateText]}>{todayDate}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigateDate('next')} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color={THEME.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
            <Ionicons name="settings-outline" size={24} color={THEME.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* All Day Events */}
      {allDayEvents.length > 0 && (
        <View style={styles.allDaySection}>
          <View style={styles.allDayEvent}>
            <View style={styles.allDayDot} />
            <View style={styles.allDayBlocksRow}>
            {allDayEvents.map((e, idx) => {
              const light = isLightColor(e.color);
              return (
                <View
                  key={e.id}
                  style={[
                    styles.eventBlock,
                    { backgroundColor: e.color },
                    // Internal spacing between adjacent all-day blocks (no edge spacing)
                    { marginRight: idx < allDayEvents.length - 1 ? 4 : 0 }
                  ]}
                > 
                  <Text style={[styles.eventTitle, light ? { color: '#111111' } : { color: THEME.text }]} numberOfLines={2}>
                    {e.title}
                  </Text>
                </View>
              );
            })}
            </View>
          </View>
        </View>
      )}

      {/* Timeline */}
      <ScrollView style={styles.timelineContainer} contentContainerStyle={{ paddingTop: hourRowHeight / 2, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View style={styles.timeline}>
          {hours.map((hour, index) => (
            <View key={hour} style={[styles.hourRow, { height: hourRowHeight }]}>
              <Text style={styles.hourText}>{hour}</Text>
              <View style={styles.hourLine} />
            </View>
          ))}
          
          {/* Events positioned absolutely */}
          {timedEvents.map(renderEvent)}
          
          {/* Current time line */}
          {(() => {
            const timePosition = getCurrentTimePosition();
            if (timePosition === null) return null;
            
            return (
              <View
                style={[
                  styles.currentTimeLine,
                  { top: timePosition }
                ]}
              >
                <View style={styles.currentTimeLineRed} />
              </View>
            );
          })()}
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finestra visibile</Text>

            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Inizio</Text>
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.stepBtn}
                  onPress={() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    const newStart = Math.max(0, startH - 1);
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    let newEnd = endH;
                    if (newStart >= endH) newEnd = Math.min(24, newStart + 1);
                    setWindowStart(`${String(newStart).padStart(2, '0')}:00`);
                    setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                  }}
                >
                  <Text style={styles.stepBtnText}>-</Text>
                </Pressable>
                <Text style={styles.timeText}>{windowStart}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.stepBtn}
                  onPress={() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    const newStart = Math.min(23, startH + 1);
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    let newEnd = endH;
                    if (newStart >= endH) newEnd = Math.min(24, newStart + 1);
                    setWindowStart(`${String(newStart).padStart(2, '0')}:00`);
                    setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                  }}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Fine</Text>
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.stepBtn}
                  onPress={() => {
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    const newEnd = Math.max(0, endH - 1);
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    let newStart = startH;
                    if (newEnd <= startH) newStart = Math.max(0, newEnd - 1);
                    setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                    setWindowStart(`${String(Math.min(newStart, 23)).padStart(2, '0')}:00`);
                  }}
                >
                  <Text style={styles.stepBtnText}>-</Text>
                </Pressable>
                <Text style={styles.timeText}>{windowEnd}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.stepBtn}
                  onPress={() => {
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    const newEnd = Math.min(24, endH + 1);
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    let newStart = startH;
                    if (newEnd <= startH) newStart = Math.max(0, newEnd - 1);
                    setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                    setWindowStart(`${String(Math.min(newStart, 23)).padStart(2, '0')}:00`);
                  }}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Ore visibili nella finestra attuale</Text>
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.stepBtn}
                  onPress={() => setVisibleHours(h => Math.max(5, h - 1))}
                >
                  <Text style={styles.stepBtnText}>-</Text>
                </Pressable>
                <Text style={styles.timeText}>{visibleHours}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.stepBtn}
                  onPress={() => setVisibleHours(h => Math.min(24, h + 1))}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setShowSettings(false)}>
                <Text style={styles.actionText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: THEME.background
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#374151'
  },
  navButton: {
    padding: 8
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  todayDateText: {
    color: '#ff3b30'
  },
  otherDateText: {
    color: '#ffffff'
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  settingsButton: {
    padding: 8
  },

  allDaySection: {
    paddingHorizontal: 0,
    paddingVertical: 2,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent'
  },
  allDayEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    paddingLeft: 65,
    paddingRight: 0
  },
  allDayBlocksRow: {
    flex: 1,
    flexDirection: 'row'
  },
  allDayDot: {
    position: 'absolute',
    left: 16,
    width: 32,
    height: 32,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    marginTop: 2
  },
  eventBlock: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 2
  },
  eventTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '600'
  },

  timelineContainer: {
    flex: 1
  },
  timeline: {
    position: 'relative',
    paddingLeft: -23, // Spostato di 163px a destra (da 140 a -23)
    paddingRight: 0,
    marginTop: 0
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 96, // Raddoppiato da 48 a 96 per mostrare solo 7 ore contemporaneamente
    position: 'relative'
  },
  hourText: {
    color: THEME.textMuted,
    fontSize: 16,
    width: 50,
    textAlign: 'right',
    marginRight: 10,
    marginLeft: 5, // Spostato di ulteriori +8px a destra rispetto a -3
    fontWeight: '700'
  },
  hourLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#374151'
  },

  timedEvent: {
    position: 'absolute',
    left: 65, // base, width/left override per evento per sovrapposizioni
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
    marginVertical: 1
  },
  eventTime: {
    color: THEME.text,
    fontSize: 13,
    marginTop: 2,
    fontWeight: '700'
  },

  currentTimeLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10
  },
  currentTimeLineRed: {
    flex: 1,
    height: 2,
    backgroundColor: '#ff3b30'
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  modalCard: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderRadius: 16,
    padding: 16
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  counterGroup: {
    marginTop: 8
  },
  pickerLabel: {
    color: THEME.textMuted,
    marginBottom: 8
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#374151'
  },
  stepBtnText: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '700'
  },
  timeText: {
    color: THEME.text,
    fontSize: 28,
    fontWeight: '800'
  },
  
  modalActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  actionBtn: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  actionText: {
    color: THEME.text,
    fontWeight: '700'
  },

});