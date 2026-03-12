import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  const [reviews, setReviews] = useState<Record<string, { rating: number | null; comment: string | null }>>(() => {
    const init: Record<string, { rating: number | null; comment: string | null }> = {};
    for (const item of items) {
      init[item.id] = { rating: item.rating ?? null, comment: item.comment ?? null };
    }
    return init;
  });

  const setRating = (id: string, rating: number) => {
    setReviews(prev => ({ ...prev, [id]: { ...prev[id], rating } }));
  };

  const setComment = (id: string, comment: string) => {
    setReviews(prev => ({ ...prev, [id]: { ...prev[id], comment } }));
  };

  const handleConfirm = () => {
    onConfirm(reviews);
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
              const rev = reviews[item.id] ?? { rating: null, comment: null };
              return (
                <View key={item.id} style={styles.itemContainer}>
                  <View style={[styles.itemHeader, { backgroundColor: item.color }]}>
                    <Text style={[styles.itemTitle, { color: textColor }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Ionicons
                      name={item.completed ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={item.completed ? (light ? '#2e7d32' : '#a5d6a7') : (light ? '#c62828' : '#ef9a9a')}
                    />
                  </View>

                  <View style={styles.itemBody}>
                    <StarRating value={rev.rating} onChange={v => setRating(item.id, v)} />
                    {!item.completed && (
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Perché non l'hai fatta?"
                        placeholderTextColor="#666"
                        value={rev.comment ?? ''}
                        onChangeText={t => setComment(item.id, t)}
                        multiline
                      />
                    )}
                    {item.completed && (
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Commento (opzionale)"
                        placeholderTextColor="#666"
                        value={rev.comment ?? ''}
                        onChangeText={t => setComment(item.id, t)}
                        multiline
                      />
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
