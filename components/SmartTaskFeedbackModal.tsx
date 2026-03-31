import type { SmartTaskFeedback } from '@/lib/smartTask';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  habitTitle: string;
  mode: 'completed' | 'overdue';
  onSelect: (feedback: SmartTaskFeedback) => void;
  onClose: () => void;
};

const OPTIONS: Record<Props['mode'], { label: string; value: SmartTaskFeedback; color: string }[]> = {
  completed: [
    { label: 'Giusta cosi', value: 'justRight', color: '#22c55e' },
    { label: 'Troppo presto', value: 'tooEarly', color: '#f59e0b' },
    { label: 'Troppo tardi', value: 'tooLate', color: '#ef4444' },
  ],
  overdue: [
    { label: 'Troppo presto', value: 'tooEarly', color: '#f59e0b' },
    { label: 'Troppo tardi', value: 'tooLate', color: '#ef4444' },
  ],
};

export default function SmartTaskFeedbackModal({
  visible,
  habitTitle,
  mode,
  onSelect,
  onClose,
}: Props) {
  const description =
    mode === 'completed'
      ? 'Hai completato questa smart task. Se la frequenza e giusta puoi confermarla e il toggle si spegne da solo.'
      : 'La data e passata senza completarla. Dimmi se e comparsa troppo presto o troppo tardi e regolo la prossima occorrenza.';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.eyebrow}>Smart task</Text>
          <Text style={styles.title}>{habitTitle}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.options}>
            {OPTIONS[mode].map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={[styles.optionButton, { borderColor: option.color }]}
              >
                <Text style={[styles.optionLabel, { color: option.color }]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={onClose} style={styles.laterButton}>
            <Text style={styles.laterText}>Piu tardi</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020617',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  eyebrow: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
  },
  description: {
    marginTop: 10,
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 21,
  },
  options: {
    marginTop: 18,
    gap: 10,
  },
  optionButton: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  laterButton: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  laterText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
});
