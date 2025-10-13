import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

type Props = {
  habit: Habit;
  index: number;
  onRename: (habit: Habit) => void;
  onSchedule: (habit: Habit) => void;
  onColor: (habit: Habit) => void;
  shouldCloseMenu?: boolean;
};

// Colori delle card come nella foto
const CARD_COLORS = [
  '#fbbf24', // Giallo
  '#ef4444', // Rosso  
  '#3b82f6', // Blu
  '#fbbf24', // Giallo (per la task completata)
  '#10b981', // Verde
  '#8b5cf6', // Viola
  '#f59e0b', // Arancione
  '#ec4899', // Rosa
];

export function HabitItem({ habit, index, onRename, onSchedule, onColor, shouldCloseMenu = false }: Props) {
  const { history, getDay, toggleDone, removeHabit } = useHabits();
  const today = getDay(new Date());
  const isDone = useMemo(() => Boolean(history[today]?.completedByHabitId?.[habit.id]), [history, today, habit.id]);
  const swipeableRef = useRef<Swipeable>(null);

  // Close menu when shouldCloseMenu becomes true
  useEffect(() => {
    if (shouldCloseMenu && swipeableRef.current) {
      swipeableRef.current.close();
    }
  }, [shouldCloseMenu]);

  const renderRightActions = () => (
    <View style={[styles.rightActions, styles.actionsTall]}>
      <TouchableOpacity 
        accessibilityRole="button" 
        onPress={() => removeHabit(habit.id)} 
        style={[styles.actionBtnTallRight, styles.deleteBtn]}
      >
        <Ionicons name="trash" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );

  const renderLeftActions = () => (
    <View style={[styles.leftActions, styles.actionsTall]}>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => onSchedule(habit)}
        style={[styles.actionBtnTallLeft, styles.renameBtn]}
      >
        <Ionicons name="create" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );

  const cardColor = habit.color ?? CARD_COLORS[index % CARD_COLORS.length];
  // Only treat exact white as white background; all others use white text
  const isWhiteBg = useMemo(() => {
    const c = (cardColor || '').toLowerCase();
    return c === '#ffffff' || c === '#fff';
  }, [cardColor]);
  const textPrimaryColor = isWhiteBg ? '#111111' : 'white';
  const textSecondaryColor = isWhiteBg ? '#111111' : 'rgba(255, 255, 255, 0.9)';
  const textTertiaryColor = isWhiteBg ? '#222222' : 'rgba(255, 255, 255, 0.7)';
  
  // Determine time display text (preserve minutes; map 23:59 to 24:00)
  const getTimeText = () => {
    const startRaw = habit.schedule?.time ?? null;
    const endRaw = habit.schedule?.endTime ?? null;
    const endNorm = endRaw === '23:59' ? '24:00' : endRaw ?? null;
    const wt = habit.schedule?.weeklyTimes;
    if (wt && Object.keys(wt).length > 0) {
      return 'Diversi orari';
    }
    if (!startRaw && !endNorm) return 'Tutto il giorno';
    if (startRaw && endNorm) return `${startRaw} - ${endNorm}`;
    if (startRaw) return startRaw;
    if (endNorm) return `- ${endNorm}`;
    return 'Tutto il giorno';
  };
  
  // Determine frequency text
  const getFrequencyText = () => {
    if (!habit.schedule) return 'Ogni giorno';
    
    const { daysOfWeek, monthDays, yearMonth, yearDay } = habit.schedule;
    if (yearMonth && yearDay) {
      return `Annuale ${String(yearDay)} / ${String(yearMonth)}`;
    }
    
    // Check if it's monthly
    if (monthDays && monthDays.length > 0) {
      if (monthDays.length === 1) {
        return `Giorno ${monthDays[0]}`;
      }
      const sortedDays = [...monthDays].sort((a, b) => a - b);
      return `Giorni ${sortedDays.join(', ')}`;
    }
    
    // Weekly logic
    if (daysOfWeek.length === 0) return 'Ogni giorno';
    if (daysOfWeek.length === 7) return 'Ogni giorno';
    
    // daysOfWeek uses 0 = Domenica ... 6 = Sabato
    const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    
    if (daysOfWeek.length === 1) {
      return dayNames[daysOfWeek[0]];
    }
    
    // For multiple days, show the specific day names
    const selectedDays = daysOfWeek.map(dayIndex => dayNames[dayIndex]);
    return selectedDays.join(', ');
  };
  
  const timeText = getTimeText();
  const frequencyText = getFrequencyText();
  // White circle ONLY if truly "every day":
  // no monthly-specific days, no annual date, and daysOfWeek is empty or all 7
  const s = habit.schedule;
  const isDaily = !s || (
    (s.daysOfWeek.length === 0 || s.daysOfWeek.length === 7) &&
    (!s.monthDays || s.monthDays.length === 0) &&
    !s.yearMonth &&
    !s.yearDay &&
    !s.time &&
    !s.endTime
  );
  
  // Don't show frequency text for daily tasks since white circle already indicates this
  const shouldShowFrequency = !isDaily;

  return (
    <Swipeable 
      ref={swipeableRef}
      renderRightActions={renderRightActions} 
      renderLeftActions={renderLeftActions} 
      overshootFriction={8}
    >
      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDone }}
          onPress={() => toggleDone(habit.id)}
          style={styles.checkContainer}
        >
          <View style={[
            styles.check,
            isWhiteBg ? { borderColor: '#111111', backgroundColor: 'white' } : { borderColor: 'rgba(255, 255, 255, 0.8)' },
            isDone && styles.checkDone
          ]}>
            {isDone && (
              <Ionicons 
                name="checkmark" 
                size={16} 
                color="white" 
              />
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={[styles.habitText, { color: textPrimaryColor }, isDone && styles.habitDone]} numberOfLines={1}>
            {habit.text}
          </Text>
          <Text style={[styles.habitSubtext, { color: textSecondaryColor }]} numberOfLines={1}> 
            {timeText}
          </Text>
          {shouldShowFrequency && (
            <Text style={[styles.frequencyText, { color: textTertiaryColor }]} numberOfLines={1}> 
              {frequencyText}
            </Text>
          )}
        </View>
        
        {isDaily && (
          <View style={styles.dailyIndicator}>
            <View style={[
              styles.dailyCircle,
              isWhiteBg
                ? { backgroundColor: '#111111', borderColor: 'rgba(0,0,0,0.3)' }
                : null
            ]} />
          </View>
        )}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    height: 75
  },
  
  checkContainer: {
    marginRight: 16
  },
  
  check: { 
    width: 24, 
    height: 24, 
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  checkDone: { 
    backgroundColor: '#10b981',
    borderColor: '#10b981'
  },
  
  content: {
    flex: 1
  },
  
  habitText: { 
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4
  },
  
  habitDone: { 
    opacity: 0.8,
    textDecorationLine: 'line-through',
    textDecorationColor: 'black',
    textDecorationStyle: 'solid'
  },
  
  habitSubtext: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    marginBottom: 2
  },
  
  frequencyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12
  },
  
  dailyIndicator: {
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  dailyCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)'
  },

  leftActions: { 
    flexDirection: 'row', 
    alignItems: 'stretch', 
    justifyContent: 'flex-start', 
    paddingLeft: 8 
  },
  
  rightActions: { 
    flexDirection: 'row', 
    alignItems: 'stretch', 
    justifyContent: 'flex-end', 
    paddingRight: 8 
  },
  actionsTall: {
    height: '100%'
  },
  
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60
  },
  actionBtnLarge: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72
  },
  actionBtnTallLeft: {
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    height: '80%',
    marginRight: 8,
    alignSelf: 'center'
  },
  actionBtnTallRight: {
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    height: '80%',
    marginLeft: 8,
    aspectRatio: 1,
    alignSelf: 'center'
  },

  deleteBtn: {
    backgroundColor: '#ef4444'
  },

  colorBtn: {
    backgroundColor: '#ec4899' // Rosa
  },

  scheduleBtn: {
    backgroundColor: '#f59e0b' // Arancione (lasciato)
  },

  renameBtn: {
    backgroundColor: '#6b7280', // Grigio
    aspectRatio: 1 // largo quanto è alto (quadrato)
  }
});