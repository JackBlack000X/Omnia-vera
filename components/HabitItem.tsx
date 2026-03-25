import { useHabits } from '@/lib/habits/Provider';
import { getDailyOccurrenceTotal, getOccurrenceDoneForDay } from '@/lib/habits/occurrences';
import type { Habit } from '@/lib/habits/schema';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

type Props = {
  habit: Habit;
  index: number;
  isDone: boolean;
  onRename: (habit: Habit) => void;
  onSchedule: (habit: Habit) => void;
  onColor: (habit: Habit) => void;
  shouldCloseMenu?: boolean;
  onMoveToFolder?: (habit: Habit) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (habit: Habit) => void;
  onLongPress?: () => void;
  /** When dragging with multiple selected, show this count as a badge on the card */
  dragBadgeCount?: number;
  onMenuOpen?: (habit: Habit) => void;
  onMenuClose?: (habit: Habit) => void;
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

const PIXEL_SIZE = 0.625;
const NOISE_INTENSITY = 35.0; // Increased to make noise more visible

/** Segmenti senza `opacity` sul View: così non si vede il contenuto sotto (icone, lista, ecc.). */
function occSegmentBackground(cardColor: string, filled: boolean): string {
  if (filled) return cardColor;
  const h = cardColor.replace('#', '').trim();
  const expand = (s: string) => (s.length === 3 ? s.split('').map(c => c + c).join('') : s);
  const full = expand(h);
  if (full.length !== 6) return cardColor;
  const t = 0.35;
  const r = Math.round(parseInt(full.slice(0, 2), 16) * t);
  const g = Math.round(parseInt(full.slice(2, 4), 16) * t);
  const b = Math.round(parseInt(full.slice(4, 6), 16) * t);
  return `rgb(${r},${g},${b})`;
}

// Function to convert hex color to RGB array for shader (slightly darkened for noise)
function getNoiseColor(hex: string): [number, number, number, number] {
  const c = (hex || '').toLowerCase();
  let r: number, g: number, b: number;

  if (c.startsWith('#') && c.length === 7) {
    r = parseInt(c.slice(1, 3), 16);
    g = parseInt(c.slice(3, 5), 16);
    b = parseInt(c.slice(5, 7), 16);
  } else if (c.startsWith('#') && c.length === 4) {
    r = parseInt(c[1] + c[1], 16);
    g = parseInt(c[2] + c[2], 16);
    b = parseInt(c[3] + c[3], 16);
  } else {
    return [0.2, 0.2, 0.2, 1.0]; // Default dark grey
  }

  // Very slight darken for noise effect (reduce by only 5-10% to keep color very visible)
  r = Math.max(0, Math.floor(r * 0.92));
  g = Math.max(0, Math.floor(g * 0.92));
  b = Math.max(0, Math.floor(b * 0.92));

  // Convert to 0-1 range for shader
  return [r / 255, g / 255, b / 255, 1.0];
}

const noiseShaderSource = `
  uniform float threshold;
  uniform float2 resolution;
  uniform float4 noiseColor;
  uniform float4 backgroundColor;
  
  // High-quality hash function to eliminate patterns (Gold Noise)
  float random(vec2 st) {
      float phi = 1.61803398874989484820459; 
      return fract(tan(distance(st * phi, st) * 123.456) * st.x);
  }

  vec4 main(vec2 pos) {
      // Quantize position to create "pixels"
      vec2 gridPos = floor(pos / ${PIXEL_SIZE});
      float r = random(gridPos);
      
      if (r * 100.0 < threshold) {
          return noiseColor;
      } else {
          return backgroundColor;
      }
  }
`;

function NoiseOverlay({ width, height, darkColor }: { width: number; height: number; darkColor: [number, number, number, number] }) {
  const noiseShader = useMemo(() => Skia.RuntimeEffect.Make(noiseShaderSource), []);

  if (!noiseShader) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <Canvas style={{ width: width + 2, height: height + 2 }}>
        <Fill>
          <Shader
            source={noiseShader}
            uniforms={{
              threshold: NOISE_INTENSITY,
              resolution: [width + 2, height + 2],
              noiseColor: darkColor,
              backgroundColor: [0.0, 0.0, 0.0, 0.0], // Transparent background
            }}
          />
        </Fill>
      </Canvas>
    </View>
  );
}

export const HabitItem = React.memo(function HabitItem({ habit, index, isDone, onRename, onSchedule, onColor, shouldCloseMenu = false, onMoveToFolder, selectionMode = false, isSelected = false, onToggleSelect, onLongPress, dragBadgeCount, onMenuOpen, onMenuClose }: Props) {
  const { activeTheme } = useAppTheme();
  const { toggleDone, removeHabit, getDay, history } = useHabits();
  const swipeableRef = useRef<Swipeable>(null);
  const [cardDimensions, setCardDimensions] = useState({ width: 0, height: 0 });
  const [checkDimensions, setCheckDimensions] = useState({ width: 0, height: 0 });
  const isTravel = habit.tipo === 'viaggio';

  // Close menu when shouldCloseMenu becomes true
  useEffect(() => {
    if (shouldCloseMenu && swipeableRef.current) {
      swipeableRef.current.close();
    }
  }, [shouldCloseMenu]);

  const renderRightActions = () => (
    <View style={[styles.rightActions, styles.actionsTall]}>
      {onMoveToFolder && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onMoveToFolder(habit)}
          style={[styles.actionBtnTallRight, styles.moveBtn]}
        >
          <Ionicons name="folder-open" size={24} color="white" />
        </TouchableOpacity>
      )}
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
  // Calculate noise color matching the task color
  const noiseColor = useMemo(() => getNoiseColor(cardColor), [cardColor]);
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
    const todayYmd = getDay(new Date());

    // If today has an explicit override, show it (this is what drag&drop in Oggi writes).
    const override = habit.timeOverrides?.[todayYmd];
    const isAllDayMarker = override === '00:00';
    const overrideStart =
      !isAllDayMarker && typeof override === 'string'
        ? override
        : (!isAllDayMarker && override && typeof override === 'object' && 'start' in override ? (override as any).start : null);
    const overrideEnd =
      !isAllDayMarker && override && typeof override === 'object' && 'end' in override
        ? (override as any).end
        : null;

    const startRaw = overrideStart ?? habit.schedule?.time ?? null;
    const endRaw = overrideEnd ?? habit.schedule?.endTime ?? null;
    const endNorm = endRaw === '23:59' ? '24:00' : endRaw ?? null;
    const wt = habit.schedule?.weeklyTimes;
    if (!overrideStart && !overrideEnd && wt && Object.keys(wt).length > 0) {
      return 'Diversi orari';
    }
    if (isAllDayMarker || habit.isAllDay) return 'Tutto il giorno';
    if (!startRaw && !endNorm) return 'Tutto il giorno';
    if (startRaw && endNorm) return `${startRaw} - ${endNorm}`;
    if (startRaw) return startRaw;
    if (endNorm) return `- ${endNorm}`;
    return 'Tutto il giorno';
  };

  const isSingle = habit.habitFreq === 'single' || (
    !habit.habitFreq &&
    (Object.keys(habit.timeOverrides ?? {}).length > 0) &&
    (habit.schedule?.daysOfWeek?.length ?? 0) === 0 &&
    !habit.schedule?.monthDays?.length &&
    !habit.schedule?.yearMonth
  );

  // Determine frequency text
  const getFrequencyText = () => {
    if (isSingle) return 'Singola';

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

  const todayYmdForOcc = getDay(new Date());
  const dayEntryForOcc = history[todayYmdForOcc];
  const occN = getDailyOccurrenceTotal(habit);
  const occK = getOccurrenceDoneForDay(dayEntryForOcc, habit);
  const multiOccSegments = occN > 1;

  /** Feedback immediato al tap sul checkbox (prima che il context aggiorni history). */
  const [optOccK, setOptOccK] = useState<number | null>(null);
  const [optDone, setOptDone] = useState<boolean | null>(null);

  useEffect(() => {
    setOptOccK(null);
    setOptDone(null);
  }, [habit.id, occN]);

  useEffect(() => {
    if (optOccK !== null && occK === optOccK) setOptOccK(null);
  }, [occK, optOccK]);

  useEffect(() => {
    if (optDone !== null && isDone === optDone) setOptDone(null);
  }, [isDone, optDone]);

  const displayOccK = selectionMode || !multiOccSegments ? occK : (optOccK !== null ? optOccK : occK);
  const lineStrikeDone = selectionMode
    ? isDone
    : occN <= 1
      ? (optDone !== null ? optDone : isDone)
      : displayOccK >= occN;
  const checkVisualDone = selectionMode ? isSelected : lineStrikeDone;

  // White circle ONLY if truly "every day":
  // no monthly-specific days, no annual date, and daysOfWeek is empty or all 7
  const s = habit.schedule;
  const isDaily = !isSingle && (!s || (
    (s.daysOfWeek.length === 0 || s.daysOfWeek.length === 7) &&
    (!s.monthDays || s.monthDays.length === 0) &&
    !s.yearMonth &&
    !s.yearDay &&
    !s.time &&
    !s.endTime
  ));

  // Don't show frequency text for daily tasks since white circle already indicates this
  const shouldShowFrequency = !isDaily;

  const cardInner = (
    <View
      style={[
        styles.card,
        { backgroundColor: multiOccSegments ? 'transparent' : cardColor },
        activeTheme === 'futuristic' && {
          borderRadius: 0,
          transform: [{ skewX: '-30deg' }],
          paddingHorizontal: 0,
          marginHorizontal: 0,
          height: 60,
          paddingVertical: 12,
          width: '90%',
          alignSelf: 'center'
        }
      ]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setCardDimensions({ width, height });
      }}
    >
      {multiOccSegments && (
        <View style={[StyleSheet.absoluteFill, styles.occurrenceSegmentsRow]} pointerEvents="none">
          {Array.from({ length: occN }, (_, i) => (
            <View
              key={i}
              style={[
                styles.occurrenceSegment,
                {
                  backgroundColor: occSegmentBackground(cardColor, i < displayOccK),
                },
              ]}
            />
          ))}
        </View>
      )}
      {dragBadgeCount != null && dragBadgeCount > 1 && (
        <View style={styles.dragBadge} pointerEvents="none">
          <Text style={styles.dragBadgeText}>{dragBadgeCount}</Text>
        </View>
      )}
      {activeTheme === 'futuristic' && cardDimensions.width > 0 && cardDimensions.height > 0 && (
        <NoiseOverlay width={cardDimensions.width} height={cardDimensions.height} darkColor={noiseColor} />
      )}
      {/* Cerchio completamento/selezone:
          - Per i viaggi nascosto in modalità normale (niente completamento)
          - In modalità selezione visibile per tutti (anche viaggi) per poter selezionare */}
      {(!isTravel || selectionMode) && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checkVisualDone }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            if (selectionMode && onToggleSelect) {
              onToggleSelect(habit);
            } else if (!isTravel) {
              let willFullyComplete = false;
              if (occN <= 1) {
                const base = optDone !== null ? optDone : isDone;
                willFullyComplete = !base;
                setOptDone(!base);
              } else {
                const baseK = optOccK !== null ? optOccK : occK;
                const nextK = (baseK + 1) % (occN + 1);
                willFullyComplete = nextK === occN;
                setOptOccK(nextK);
              }
              if (willFullyComplete) {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              toggleDone(habit.id);
            }
          }}
          style={({ pressed }) => [
            styles.checkContainer,
            activeTheme === 'futuristic' && { marginLeft: 10 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View
            style={[
              styles.check,
              isWhiteBg ? { borderColor: 'rgba(0,0,0,0.5)' } : { borderColor: 'rgba(255, 255, 255, 0.8)' },
              !selectionMode && lineStrikeDone && styles.checkDone,
              selectionMode && isSelected && (isWhiteBg ? styles.checkSelectedWhite : styles.checkSelected),
              activeTheme === 'futuristic' && {
                borderRadius: 0,
                aspectRatio: 1,
                transform: [{ skewX: '-2deg' }]
              }
            ]}
            onLayout={(e) => {
              const incomplete = selectionMode ? !isDone : !lineStrikeDone;
              if (activeTheme === 'futuristic' && incomplete) {
                const { width, height } = e.nativeEvent.layout;
                setCheckDimensions({ width, height });
              }
            }}
          >
            {activeTheme === 'futuristic' && (selectionMode ? !isDone : !lineStrikeDone) && checkDimensions.width > 0 && checkDimensions.height > 0 && (
              <View style={{ position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, overflow: 'hidden', borderRadius: 10 }}>
                <NoiseOverlay width={checkDimensions.width - 4} height={checkDimensions.height - 4} darkColor={noiseColor} />
              </View>
            )}
            {!selectionMode && !isTravel && lineStrikeDone && (
              <Ionicons
                name="checkmark"
                size={16}
                color="white"
              />
            )}
          </View>
        </Pressable>
      )}

      <View style={[styles.content, timeText === 'Tutto il giorno' && { justifyContent: 'center' }]}>
        <Text
          style={[styles.habitText, { color: textPrimaryColor }, lineStrikeDone && styles.habitDone]}
          numberOfLines={isTravel ? 2 : 1}
        >
          {habit.text}
        </Text>
        {timeText !== 'Tutto il giorno' && (
          <Text style={[styles.habitSubtext, { color: textSecondaryColor }]} numberOfLines={1}>
            {timeText}
          </Text>
        )}
        {shouldShowFrequency && timeText !== 'Tutto il giorno' && (
          <Text style={[styles.frequencyText, { color: textTertiaryColor }]} numberOfLines={1}>
            {frequencyText}
          </Text>
        )}
      </View>

      {isDaily && (
        <View style={[
          styles.dailyIndicator,
          activeTheme === 'futuristic' && { marginLeft: 2, left: -10 }
        ]}>
          <View style={[
            styles.dailyCircle,
            { backgroundColor: cardColor, borderColor: 'transparent' },
            activeTheme === 'futuristic' && {
              borderRadius: 0,
              aspectRatio: 1,
              transform: [{ skewX: '-2deg' }]
            }
          ]} />
        </View>
      )}
    </View>
  );

  const Wrapper = selectionMode
    ? ({ children }: { children: React.ReactNode }) => (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onToggleSelect?.(habit)}
        onLongPress={onLongPress}
        delayLongPress={200}
        style={{ width: '100%' }}
      >
        {children}
      </TouchableOpacity>
    )
    : ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={selectionMode ? () => null : renderRightActions}
      renderLeftActions={selectionMode ? () => null : renderLeftActions}
      overshootFriction={8}
      onSwipeableOpen={() => onMenuOpen?.(habit)}
      onSwipeableClose={() => onMenuClose?.(habit)}
    >
      <Wrapper>{cardInner}</Wrapper>
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  dragBadge: {
    position: 'absolute',
    top: 8,
    right: 12,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 10,
  },
  dragBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    height: 75,
    overflow: 'hidden',
  },

  occurrenceSegmentsRow: {
    flexDirection: 'row',
    zIndex: 0,
  },

  occurrenceSegment: {
    flex: 1,
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
  checkSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.95)'
  },
  checkSelectedWhite: {
    backgroundColor: '#000000',
    borderColor: '#000000'
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
    justifyContent: 'center',
    position: 'relative'
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
  moveBtn: {
    backgroundColor: '#3b82f6'
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