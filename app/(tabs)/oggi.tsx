import { THEME } from '@/constants/theme';
import { isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TZ = 'Europe/Zurich';

// -- Helper Functions --

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

function toMinutes(hhmm: string) {
  if (hhmm === '24:00') return 1440;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// -- Constants for Layout --
// HOUR_HEIGHT moved to state to allow zooming
// Margine sinistro per lasciare spazio all'etichetta dell'ora (es. "09:00")
const LEFT_MARGIN = 65;
// Altezza del separatore (linea grigia)
const SEPARATOR_HEIGHT = 1;
// Font size per l'etichetta dell'ora
const HOUR_FONT_SIZE = 14;

export default function OggiScreen() {
  const { habits, history, getDay } = useHabits();
  const { activeTheme } = useAppTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [windowStart, setWindowStart] = useState<string>('06:00');
  const [windowEnd, setWindowEnd] = useState<string>('22:00');
  const [visibleHours, setVisibleHours] = useState<number>(10);

  // -- Data Loading & Persistence --
  useEffect(() => {
    (async () => {
      try {
        const [start, end, visible] = await Promise.all([
          AsyncStorage.getItem('oggi_window_start_v1'),
          AsyncStorage.getItem('oggi_window_end_v1'),
          AsyncStorage.getItem('oggi_visible_hours_v1'),
        ]);
        if (start) setWindowStart(start);
        if (end) setWindowEnd(end);
        if (visible) {
             const v = parseInt(visible, 10);
             if (!isNaN(v) && v >= 5 && v <= 24) setVisibleHours(v);
        }
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
    AsyncStorage.setItem('oggi_visible_hours_v1', visibleHours.toString()).catch(() => {});
  }, [visibleHours]);

  // -- Time Updates --
  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);


  // -- Derived State for Layout --
  const today = getDay(currentDate);
  const todayDate = useMemo(() => formatDateLong(currentDate, TZ), [currentDate]);

  const windowStartMin = toMinutes(windowStart);
  const windowEndMin = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  
  // Dynamic HOUR_HEIGHT based on visibleHours
  // We assume roughly 70% of screen height is available for the timeline
  const hourHeight = useMemo(() => {
      return (Dimensions.get('window').height * 0.70) / visibleHours;
  }, [visibleHours]);

  // Calcoliamo l'altezza totale della scroll view basandoci sui minuti totali visibili
  // Usiamo una scala lineare: pixel = minuti * (hourHeight / 60)
  const totalMinutes = windowEndMin - windowStartMin;
  const totalHeight = (totalMinutes / 60) * hourHeight;
  
  // Generiamo le etichette delle ore.
  // Partiamo dall'ora intera che contiene windowStartMin o subito dopo
  const hours = useMemo(() => {
    const startHour = Math.floor(windowStartMin / 60);
    const endHour = Math.floor((windowEndMin - 1) / 60); // Ultima ora che inizia prima della fine
    const result = [];
    // Aggiungiamo un'ora extra alla fine per chiudere la griglia se necessario
    for (let h = startHour; h <= endHour + 1; h++) {
      result.push(h);
    }
    return result;
  }, [windowStartMin, windowEndMin]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  // -- Event Processing --
  type OggiEvent = { id: string; title: string; startTime: string; endTime: string; isAllDay: boolean; color: string };
  
  const weekday = useMemo(() => currentDate.getDay(), [currentDate]);
  const dayOfMonth = useMemo(() => currentDate.getDate(), [currentDate]);
  const monthIndex1 = useMemo(() => currentDate.getMonth() + 1, [currentDate]);

  const { timedEvents, allDayEvents } = useMemo(() => {
    const items: OggiEvent[] = [];
    const allDay: OggiEvent[] = [];
    
    for (const h of habits) {
      // Logic for date filtering (same as before)
      const selectedYmd = getDay(currentDate);
      const hasOverrideForSelected = !!h.timeOverrides?.[selectedYmd];
      if (h.createdAt && selectedYmd < h.createdAt && !hasOverrideForSelected) continue;

      const sched = h.schedule;
      let showToday = true;
      if (sched) {
        const dow = sched.daysOfWeek ?? [];
        const mdays = sched.monthDays ?? [];
        const yrM = sched.yearMonth ?? null;
        const yrD = sched.yearDay ?? null;
        const weeklyApplies = dow.length === 0 || dow.includes(weekday);
        const monthlyApplies = mdays.length > 0 ? mdays.includes(dayOfMonth) : true;
        const annualApplies = yrM && yrD ? (yrM === monthIndex1 && yrD === dayOfMonth) : true;
        showToday = weeklyApplies && monthlyApplies && annualApplies;
      }
      if (!showToday) continue;

      // Time logic
      const ymd = selectedYmd;
      const overrideStart = h.timeOverrides?.[ymd];
      
       // One-off logic
      const schedDays = h.schedule?.daysOfWeek ?? [];
      const schedMonth = h.schedule?.monthDays ?? [];
      const isOneOff = (schedDays.length === 0 && schedMonth.length === 0 && h.timeOverrides && Object.keys(h.timeOverrides).length > 0);
      if (isOneOff && !overrideStart) continue;

      const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
      const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
      const start = overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (h.schedule?.time ?? null));
      const end = (weekly?.end ?? monthlyT?.end ?? (h.schedule?.endTime ?? null));
      const color = h.color ?? '#3b82f6';
      const title = h.text;

      if (!start && !end) {
        allDay.push({ id: h.id, title, startTime: '00:00', endTime: '24:00', isAllDay: true, color });
      } else if (start) {
        // Normalize end time
        let finalEnd = end;
        if (!end) {
           const [sh] = start.split(':').map(Number);
           const nextHour = Math.min(24, sh + 1);
           finalEnd = nextHour === 24 ? '24:00' : `${String(nextHour).padStart(2, '0')}:00`;
        } else if (end === '23:59') {
          finalEnd = '24:00';
        }
        items.push({ id: h.id, title, startTime: start, endTime: finalEnd!, isAllDay: false, color });
      } else if (!start && end) {
        // Only end provided
        const [eh] = end.split(':').map(Number);
        const startHour = Math.max(0, eh - 1);
        items.push({ id: h.id, title, startTime: `${String(startHour).padStart(2, '0')}:00`, endTime: end === '23:59' ? '24:00' : end, isAllDay: false, color });
      }
    }
    return { timedEvents: items, allDayEvents: allDay };
  }, [habits, weekday, dayOfMonth, currentDate, getDay, monthIndex1]);

  // -- Layout Calculation for Overlaps --
  type LayoutInfo = { col: number; columns: number };
  const layoutById = useMemo<Record<string, LayoutInfo>>(() => {
    // Sort by start time
    const events = timedEvents.map(e => ({
      ...e,
      s: toMinutes(e.startTime),
      e: toMinutes(e.endTime)
    })).sort((a, b) => a.s - b.s || a.e - b.e);

    const active: Array<{ id: string; end: number; col: number }> = [];
    const layout: Record<string, LayoutInfo> = {};
    
    // Simple column assignment strategy: first fit
    // This is a simplified version of the "packing" algorithm
    // Note: For perfect Google Calendar style layout, we need a more complex graph coloring or cluster analysis.
    // Here we use a simpler greedy approach per cluster of overlapping events.
    
    // Identify clusters
    let clusters: typeof events[] = [];
    let currentCluster: typeof events = [];
    let clusterEnd = -1;

    for (const ev of events) {
      if (currentCluster.length === 0) {
        currentCluster.push(ev);
        clusterEnd = ev.e;
      } else {
        if (ev.s < clusterEnd) {
          currentCluster.push(ev);
          clusterEnd = Math.max(clusterEnd, ev.e);
        } else {
          clusters.push(currentCluster);
          currentCluster = [ev];
          clusterEnd = ev.e;
        }
      }
    }
    if (currentCluster.length > 0) clusters.push(currentCluster);

    // Process each cluster
    for (const cluster of clusters) {
      // Simple column packing for the cluster
      const columns: typeof cluster[] = [];
      for (const ev of cluster) {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          const lastInCol = col[col.length - 1];
          if (lastInCol.e <= ev.s) {
            col.push(ev);
            layout[ev.id] = { col: i, columns: 1 }; // Will update columns later
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([ev]);
          layout[ev.id] = { col: columns.length - 1, columns: 1 };
        }
      }
      // Update total columns for everyone in this cluster
      const totalCols = columns.length;
      for (const ev of cluster) {
        layout[ev.id].columns = totalCols;
      }
    }

    return layout;
  }, [timedEvents]);


  // -- Helper to calculate styles --
  const getEventStyle = (event: OggiEvent) => {
    const startM = toMinutes(event.startTime);
    const endM = toMinutes(event.endTime);
    
    // Clip to view window
    if (endM <= windowStartMin || startM >= windowEndMin) return null;
    
    const visibleStart = Math.max(startM, windowStartMin);
    const visibleEnd = Math.min(endM, windowEndMin);
    
    // Coordinates
    const top = ((visibleStart - windowStartMin) / 60) * hourHeight;
    const durationMin = visibleEnd - visibleStart;
    const height = Math.max(1, (durationMin / 60) * hourHeight);
    
    // Horizontal layout
    const lay = layoutById[event.id] || { col: 0, columns: 1 };
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN; // Removed right padding to use full width
    const colWidth = availableWidth / lay.columns;
    const left = LEFT_MARGIN + (lay.col * colWidth);
    
    // Adjust for visual separation from grid lines
    // Add 2px top margin to sit below the hour line
    // Subtract 4px height to sit above the next hour line (and account for top margin)
    const adjustedTop = top + 2;
    const adjustedHeight = Math.max(1, height - 4); // No min height limit, purely proportional

    return {
      top: adjustedTop,
      height: adjustedHeight,
      left,
      width: colWidth - 2, // 2px spacing
    };
  };
  
  const getCurrentTimeTop = () => {
     const now = currentTime;
     const min = now.getHours() * 60 + now.getMinutes();
     if (min < windowStartMin || min > windowEndMin) return null;
     return ((min - windowStartMin) / 60) * hourHeight;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 60 }]}>
        <TouchableOpacity onPress={() => navigateDate('prev')} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={[styles.dateText, isToday(currentDate, TZ) ? styles.todayDateText : styles.otherDateText]}>
          {todayDate}
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigateDate('next')} style={styles.navButton}>
             <Ionicons name="chevron-forward" size={24} color={THEME.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
             <Ionicons name="settings-outline" size={24} color={THEME.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* All Day Area */}
      {allDayEvents.length > 0 && (
        <View style={styles.allDayContainer}>
             <View style={styles.allDayLabelContainer}>
                <View style={styles.allDayDot} />
             </View>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.allDayScroll}>
               {allDayEvents.map((e) => {
                 const bg = e.color;
                 const light = isLightColor(bg);
                 return (
                   <View key={e.id} style={[styles.allDayItem, { backgroundColor: bg }]}>
                      <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF' }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                   </View>
                 );
               })}
             </ScrollView>
        </View>
      )}

      {/* Main Timeline Scroll */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ height: Math.max(totalHeight + 100, Dimensions.get('window').height) }} // Ensure scrollable
        showsVerticalScrollIndicator={false}
      >
         <View style={{ height: totalHeight + 80 }}> 
             {/* Grid Lines & Hours */}
             {hours.map(h => {
                const minutesFromStart = (h * 60) - windowStartMin;
                // Don't draw if completely out of bounds
                if (minutesFromStart < 0 || minutesFromStart > totalMinutes + 60) return null;
                
                // Aggiungo un offset verticale di base (es. 10px) per evitare che la prima ora (00:00) sia tagliata
                const BASE_OFFSET = 10; 
                const top = (minutesFromStart / 60) * hourHeight + BASE_OFFSET;
                
                return (
                  <View key={h} style={[styles.hourRow, { top }]}>
                      <Text style={styles.hourLabel}>
                        {`${String(h).padStart(2, '0')}:00`}
                      </Text>
                      <View style={styles.hourLine} />
                  </View>
                );
             })}

             {/* Events */}
             {timedEvents.map(e => {
               const style = getEventStyle(e);
               if (!style) return null;
               const bg = e.color;
               const light = isLightColor(bg);
               
               // Aggiungo lo stesso offset di base anche agli eventi
               const BASE_OFFSET = 10;

               return (
                 <TouchableOpacity 
                    key={e.id}
                    activeOpacity={0.8}
                    style={[styles.eventItem, { 
                      top: style.top + BASE_OFFSET,
                      height: style.height,
                      left: style.left,
                      width: style.width,
                      backgroundColor: bg
                    }]}
                 >
                    <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF' }]} numberOfLines={1}>
                      {e.title}
                    </Text>
                    {style.height > 30 && (
                       <Text style={[styles.eventTime, { color: light ? '#000' : '#FFF' }]}>
                         {e.startTime} - {e.endTime}
                       </Text>
                    )}
                 </TouchableOpacity>
               );
             })}

             {/* Current Time Indicator */}
             {(() => {
               const top = getCurrentTimeTop();
               if (top === null) return null;
               const BASE_OFFSET = 10;
               return (
                 <View style={[styles.currentTimeIndicator, { top: top + BASE_OFFSET }]}>
                    <View style={styles.currentTimeDot} />
                    <View style={styles.currentTimeLine} />
                 </View>
               );
             })()}
         </View>
      </ScrollView>

      {/* Settings Modal (Simplified for brevity, keeping core functional) */}
      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
         <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
               <Text style={styles.modalTitle}>Impostazioni Vista</Text>
               
               {/* Start Time Control */}
               <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Inizio: {windowStart}</Text>
                  <View style={styles.settingControls}>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const m = toMinutes(windowStart);
                        if (m > 0) setWindowStart(`${String(Math.floor((m-60)/60)).padStart(2, '0')}:00`);
                     }}><Text style={styles.controlBtnText}>-</Text></TouchableOpacity>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const startM = toMinutes(windowStart);
                        const endM = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
                        // Ensure at least 5 hour window (300 min)
                        if (startM < endM - 300) {
                            const nextStartM = startM + 60;
                            const newDuration = (endM - nextStartM) / 60;
                            if (visibleHours > newDuration) {
                                setVisibleHours(Math.max(5, Math.floor(newDuration)));
                            }
                            setWindowStart(`${String(Math.floor(nextStartM/60)).padStart(2, '0')}:00`);
                        }
                     }}><Text style={styles.controlBtnText}>+</Text></TouchableOpacity>
                  </View>
               </View>

               {/* End Time Control */}
               <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Fine: {windowEnd}</Text>
                  <View style={styles.settingControls}>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const startM = toMinutes(windowStart);
                        const endM = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
                        // Ensure at least 5 hour window (300 min)
                        if (endM > startM + 300) {
                             const nextEndM = endM - 60;
                             const newDuration = (nextEndM - startM) / 60;
                             if (visibleHours > newDuration) {
                                 setVisibleHours(Math.max(5, Math.floor(newDuration)));
                             }
                             setWindowEnd(nextEndM === 1440 ? '24:00' : `${String(Math.floor(nextEndM/60)).padStart(2, '0')}:00`);
                        }
                     }}><Text style={styles.controlBtnText}>-</Text></TouchableOpacity>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const m = toMinutes(windowEnd);
                        if (m < 1440) {
                           const next = Math.min(24, Math.floor((m+60)/60));
                           setWindowEnd(next === 24 ? '24:00' : `${String(next).padStart(2, '0')}:00`);
                        }
                     }}><Text style={styles.controlBtnText}>+</Text></TouchableOpacity>
                  </View>
               </View>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Ore Visibili: {visibleHours}</Text>
                    <View style={styles.settingControls}>
                       <TouchableOpacity style={styles.controlBtn} onPress={() => {
                          if (visibleHours > 5) setVisibleHours(prev => prev - 1);
                       }}><Text style={styles.controlBtnText}>-</Text></TouchableOpacity>
                       <TouchableOpacity style={styles.controlBtn} onPress={() => {
                          if (visibleHours < 24) {
                              const nextVisible = visibleHours + 1;
                              setVisibleHours(nextVisible);
                              
                              // Adjust window if visible hours > duration
                              const startM = toMinutes(windowStart);
                              const endM = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
                              const currentDuration = (endM - startM) / 60;
                              
                              if (nextVisible > currentDuration) {
                                   let newEndM = startM + (nextVisible * 60);
                                   let newStartM = startM;
                                   
                                   if (newEndM > 1440) {
                                       newEndM = 1440;
                                       newStartM = Math.max(0, 1440 - (nextVisible * 60));
                                   }
                                   
                                   const fmt = (m: number) => `${String(Math.floor(m/60)).padStart(2, '0')}:00`;
                                   setWindowStart(fmt(newStartM));
                                   setWindowEnd(newEndM === 1440 ? '24:00' : fmt(newEndM));
                              }
                          }
                       }}><Text style={styles.controlBtnText}>+</Text></TouchableOpacity>
                    </View>
                </View>

               <TouchableOpacity style={styles.closeBtn} onPress={() => setShowSettings(false)}>
                  <Text style={styles.closeBtnText}>Chiudi</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  navButton: {
    padding: 4,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  todayDateText: {
    color: '#FF3B30',
  },
  otherDateText: {
    color: '#FFF',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  settingsButton: {
    padding: 4,
  },
  
  // All Day
  allDayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    minHeight: 50,
  },
  allDayLabelContainer: {
    width: LEFT_MARGIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  allDayScroll: {
    flex: 1,
    paddingRight: 10,
  },
  allDayItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
    minWidth: 80,
  },

  // Timeline
  scrollView: {
    flex: 1,
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 20, // Just for the label area
    transform: [{ translateY: -10 }], // Center label vertically on the line
  },
  hourLabel: {
    width: LEFT_MARGIN,
    textAlign: 'right',
    paddingRight: 10,
    color: '#AAA', // Lighter text
    fontSize: 15, // Even larger
    fontWeight: '800', // Extra bold
  },
  hourLine: {
    flex: 1,
    height: 3, // Even thicker line
    backgroundColor: '#555', // More visible
  },
  
  // Events
  eventItem: {
    position: 'absolute',
    borderRadius: 6,
    padding: 4,
    overflow: 'hidden',
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  eventTime: {
    fontSize: 10,
    opacity: 0.8,
  },

  // Current Time
  currentTimeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 99,
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginLeft: LEFT_MARGIN - 4, // Center on the line start
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#FF3B30',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  settingLabel: {
    color: '#FFF',
    fontSize: 16,
  },
  settingControls: {
    flexDirection: 'row',
    gap: 10,
  },
  controlBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#333',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnWide: {
    paddingHorizontal: 15,
    height: 40,
    backgroundColor: '#333',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    marginTop: 10,
    backgroundColor: '#3A3A3C',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
