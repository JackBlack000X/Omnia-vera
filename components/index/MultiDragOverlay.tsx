import type { Habit } from '@/lib/habits/schema';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

export type MultiDragAnimVals = {
  activeCellOffset: { value: number };
  /** Same value used by the library for the dragged cell transform (translateY) */
  hoverAnim: { value: number };
  scrollOffset: { value: number };
};

const CARD_HEIGHT = 75;
const CARD_GAP = 4;

type Props = {
  animVals: MultiDragAnimVals | null;
  containerY: number;
  selectedHabits: Habit[];
  visible: boolean;
};

export function MultiDragOverlay({ animVals, containerY, selectedHabits, visible }: Props) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    if (!animVals) {
      return { position: 'absolute' as const, left: 0, right: 0, top: -9999, opacity: 0, zIndex: 1000 };
    }
    const top =
      containerY +
      animVals.activeCellOffset.value -
      animVals.scrollOffset.value +
      animVals.hoverAnim.value;
    return {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top,
      opacity: 1,
      zIndex: 1000,
    };
  }, [containerY, animVals]);

  if (!visible || selectedHabits.length <= 1 || !animVals) return null;

  return (
    <Animated.View
      style={[styles.overlay, animatedStyle]}
      pointerEvents="none"
    >
      <View style={styles.stack}>
        {selectedHabits.map((habit, i) => (
          <View
            key={habit.id}
            style={[
              styles.card,
              { backgroundColor: habit.color ?? '#6b7280' },
              i > 0 && { marginTop: CARD_GAP },
            ]}
          >
            <Text style={styles.cardText} numberOfLines={1}>
              {habit.text}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  stack: {
    paddingHorizontal: 0,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  cardText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
