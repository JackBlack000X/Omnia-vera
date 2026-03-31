import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type ReviewHabitItem = {
  id: string;
  title: string;
  color: string;
  completed: boolean;
  rating?: number;
  comment?: string;
};

type Props = {
  visible: boolean;
  date: string;
  dateLabel: string;
  items: ReviewHabitItem[];
  onConfirm: (reviews: Record<string, { rating: number | null; comment: string | null }>) => void;
  onClose: () => void;
};

const MISSED_HABIT_REASONS = [
  'Non ho avuto tempo',
  'Me ne sono dimenticato/a',
  'Non avevo energie',
  "C'è stato un imprevisto",
  'Non mi sentivo bene',
  'Avevo altre priorità',
  'Non ero nel posto giusto',
  'Non ne avevo voglia',
] as const;

const CUSTOM_REASON_OPTION = 'Altro';

type ReviewDraft = {
  rating: number | null;
  comment: string | null;
  selectedReason: string | null;
  customReason: string;
};

function isPresetReason(comment: string | null | undefined): comment is (typeof MISSED_HABIT_REASONS)[number] {
  return Boolean(comment) && MISSED_HABIT_REASONS.some(reason => reason === comment);
}

function createReviewDraft(item: Pick<ReviewHabitItem, 'completed' | 'rating' | 'comment'>): ReviewDraft {
  const comment = item.completed ? null : (item.comment ?? null);
  const customReason = comment && !isPresetReason(comment) ? comment : '';
  return {
    rating: item.rating ?? null,
    comment,
    selectedReason: isPresetReason(comment) ? comment : customReason.trim() ? CUSTOM_REASON_OPTION : null,
    customReason,
  };
}

function StarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <View style={starStyles.row}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(star => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}>
          <Ionicons
            name={value !== null && star <= value ? 'star' : 'star-outline'}
            size={20}
            color={value !== null && star <= value ? '#FFD700' : '#555'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
});

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

export default function DayReviewModal({ visible, date, dateLabel, items, onConfirm, onClose }: Props) {
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>(() => {
    const init: Record<string, ReviewDraft> = {};
    for (const item of items) {
      init[item.id] = createReviewDraft(item);
    }
    return init;
  });

  useEffect(() => {
    if (!visible) return;
    const init: Record<string, ReviewDraft> = {};
    for (const item of items) {
      init[item.id] = createReviewDraft(item);
    }
    setReviews(init);
  }, [visible, date, items]);

  const setRating = (id: string, rating: number) => {
    setReviews(prev => ({ ...prev, [id]: { ...prev[id], rating } }));
  };

  const selectReason = (id: string, reason: string) => {
    setReviews(prev => {
      const current = prev[id];
      if (!current) return prev;

      if (current.selectedReason === reason) {
        return {
          ...prev,
          [id]: {
            ...current,
            selectedReason: null,
            comment: null,
          },
        };
      }

      if (reason === CUSTOM_REASON_OPTION) {
        return {
          ...prev,
          [id]: {
            ...current,
            selectedReason: CUSTOM_REASON_OPTION,
            comment: current.customReason,
          },
        };
      }

      return {
        ...prev,
        [id]: {
          ...current,
          selectedReason: reason,
          comment: reason,
        },
      };
    });
  };

  const setCustomReason = (id: string, text: string) => {
    setReviews(prev => {
      const current = prev[id];
      if (!current) return prev;
      return {
        ...prev,
        [id]: {
          ...current,
          selectedReason: CUSTOM_REASON_OPTION,
          customReason: text,
          comment: text,
        },
      };
    });
  };

  const handleConfirm = () => {
    const payload = Object.fromEntries(
      items.map(item => {
        const review = reviews[item.id] ?? createReviewDraft(item);
        return [
          item.id,
          { rating: review.rating, comment: item.completed ? null : review.comment },
        ];
      })
    );
    onConfirm(payload);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Revisione giornaliera</Text>
          <Text style={styles.dateLabel}>{dateLabel}</Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {items.map(item => {
              const light = isLightColor(item.color);
              const textColor = light ? '#000' : '#FFF';
              const rev = reviews[item.id] ?? createReviewDraft(item);
              return (
                <View key={item.id} style={styles.itemContainer}>
                  <View style={[styles.itemHeader, { backgroundColor: item.color }]}>
                    <Text style={[styles.itemTitle, { color: textColor }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.completed && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={light ? '#2e7d32' : '#a5d6a7'}
                      />
                    )}
                  </View>

                  <View style={styles.itemBody}>
                    <StarRating value={rev.rating} onChange={v => setRating(item.id, v)} />
                    {!item.completed && (
                      <View style={styles.reasonSection}>
                        <Text style={styles.reasonLabel}>Perché non l&apos;hai fatta?</Text>
                        <View style={styles.reasonChips}>
                          {[...MISSED_HABIT_REASONS, CUSTOM_REASON_OPTION].map(reason => {
                            const selected = rev.selectedReason === reason;
                            return (
                              <TouchableOpacity
                                key={reason}
                                style={[styles.reasonChip, selected && styles.reasonChipSelected]}
                                onPress={() => selectReason(item.id, reason)}
                              >
                                <Text style={[styles.reasonChipText, selected && styles.reasonChipTextSelected]}>
                                  {reason}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {rev.selectedReason === CUSTOM_REASON_OPTION && (
                          <TextInput
                            style={styles.commentInput}
                            placeholder="Scrivi tu..."
                            placeholderTextColor="#666"
                            value={rev.customReason}
                            onChangeText={text => setCustomReason(item.id, text)}
                            multiline
                          />
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
            <Text style={styles.confirmBtnText}>Conferma</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 20,
    maxHeight: '90%',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  dateLabel: {
    color: '#AAA',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  scroll: {
    flexGrow: 0,
  },
  itemContainer: {
    marginBottom: 14,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  itemBody: {
    backgroundColor: '#2C2C2E',
    padding: 10,
    gap: 8,
  },
  commentInput: {
    backgroundColor: '#3A3A3C',
    borderRadius: 8,
    padding: 8,
    color: '#FFF',
    fontSize: 13,
    minHeight: 40,
  },
  reasonSection: {
    gap: 8,
  },
  reasonLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    backgroundColor: '#3A3A3C',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4B5563',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasonChipSelected: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  reasonChipText: {
    color: '#F3F4F6',
    fontSize: 12,
    fontWeight: '600',
  },
  reasonChipTextSelected: {
    color: '#FFF',
  },
  confirmBtn: {
    marginTop: 16,
    backgroundColor: '#FF3B30',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
