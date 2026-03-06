import { styles } from '@/components/index/indexStyles';
import { FOLDER_COLORS, FOLDER_ICONS, FolderFilters, FolderItem } from '@/lib/index/indexTypes';
import { COLORS } from '@/components/modal/modalStyles';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { THEME } from '@/constants/theme';

export type FolderModalsProps = {
  createFolderVisible: boolean;
  setCreateFolderVisible: (v: boolean) => void;
  editFolderVisible: boolean;
  setEditFolderVisible: (v: boolean) => void;
  editingFolder: FolderItem | null;
  setEditingFolder: (v: FolderItem | null) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  newFolderColor: string;
  setNewFolderColor: (v: string) => void;
  newFolderIcon: string;
  setNewFolderIcon: (v: string) => void;
  newFolderFilters: FolderFilters;
  setNewFolderFilters: (v: FolderFilters) => void;
  handleCreateFolder: () => void;
  handleSaveEditFolder: () => void;
  performDeleteFolder: (folderName: string) => void;
};

const TIPO_OPTIONS: { value: 'task' | 'abitudine' | 'evento'; label: string; icon: string }[] = [
  { value: 'task', label: 'Task', icon: 'checkbox-outline' },
  { value: 'evento', label: 'Eventi', icon: 'calendar-outline' },
  { value: 'abitudine', label: 'Abitudini', icon: 'repeat-outline' },
];

const FREQ_OPTIONS: { value: 'single' | 'daily' | 'weekly' | 'monthly' | 'annual'; label: string }[] = [
  { value: 'single', label: 'Singola' },
  { value: 'daily', label: 'Giornaliera' },
  { value: 'weekly', label: 'Settimanale' },
  { value: 'monthly', label: 'Mensile' },
  { value: 'annual', label: 'Annuale' },
];

function FiltersSection({ filters, setFilters }: { filters: FolderFilters; setFilters: (f: FolderFilters) => void }) {
  const [expanded, setExpanded] = useState(
    !!(filters.tipos?.length || filters.colors?.length || filters.frequencies?.length)
  );

  const toggleTipo = (t: 'task' | 'abitudine' | 'evento') => {
    const current = filters.tipos ?? [];
    const next = current.includes(t) ? current.filter(x => x !== t) : [...current, t];
    setFilters({ ...filters, tipos: next.length ? next : undefined });
  };

  const toggleColor = (c: string) => {
    const current = filters.colors ?? [];
    const next = current.includes(c) ? current.filter(x => x !== c) : [...current, c];
    setFilters({ ...filters, colors: next.length ? next : undefined });
  };

  const toggleFreq = (f: 'single' | 'daily' | 'weekly' | 'monthly' | 'annual') => {
    const current = filters.frequencies ?? [];
    const next = current.includes(f) ? current.filter(x => x !== f) : [...current, f];
    setFilters({ ...filters, frequencies: next.length ? next : undefined });
  };

  const hasActiveFilters = !!(filters.tipos?.length || filters.colors?.length || filters.frequencies?.length);

  return (
    <View style={fStyles.filterSection}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={fStyles.filterHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="funnel-outline" size={16} color={hasActiveFilters ? '#3b82f6' : THEME.textMuted} />
          <Text style={[fStyles.filterHeaderText, hasActiveFilters && { color: '#3b82f6' }]}>
            Filtri{hasActiveFilters ? ' (attivi)' : ''}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={THEME.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={fStyles.filterBody}>
          <Text style={fStyles.filterLabel}>Tipo</Text>
          <View style={fStyles.chipRow}>
            {TIPO_OPTIONS.map(opt => {
              const active = filters.tipos?.includes(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => toggleTipo(opt.value)}
                  style={[fStyles.chip, active && fStyles.chipActive]}
                >
                  <Ionicons name={opt.icon as any} size={14} color={active ? '#fff' : THEME.textMuted} />
                  <Text style={[fStyles.chipText, active && fStyles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={fStyles.filterLabel}>Colore</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fStyles.colorFilterRow}>
            {COLORS.map(c => {
              const active = filters.colors?.includes(c);
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => toggleColor(c)}
                  style={[
                    fStyles.colorFilterDot,
                    { backgroundColor: c },
                    c === '#000000' && { borderWidth: 1, borderColor: '#4b5563' },
                    active && { borderColor: '#fff', borderWidth: 2.5, transform: [{ scale: 1.15 }] },
                  ]}
                >
                  {active && <Ionicons name="checkmark" size={14} color={c === '#ffffff' || c === '#fbbf24' ? '#000' : '#fff'} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={fStyles.filterLabel}>Frequenza</Text>
          <View style={fStyles.chipRow}>
            {FREQ_OPTIONS.map(opt => {
              const active = filters.frequencies?.includes(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => toggleFreq(opt.value)}
                  style={[fStyles.chip, active && fStyles.chipActive]}
                >
                  <Text style={[fStyles.chipText, active && fStyles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

export function FolderModals(props: FolderModalsProps) {
  const {
    createFolderVisible,
    setCreateFolderVisible,
    editFolderVisible,
    setEditFolderVisible,
    editingFolder,
    setEditingFolder,
    newFolderName,
    setNewFolderName,
    newFolderColor,
    setNewFolderColor,
    newFolderIcon,
    setNewFolderIcon,
    newFolderFilters,
    setNewFolderFilters,
    handleCreateFolder,
    handleSaveEditFolder,
    performDeleteFolder,
  } = props;

  return (
    <>
      <Modal visible={editFolderVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setEditFolderVisible(false); setEditingFolder(null); }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <ScrollView style={{ maxHeight: '100%' }} bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.createFolderCard}>
                <Text style={styles.createFolderTitle}>Modifica cartella</Text>

                <Text style={styles.createFolderLabel}>Nome</Text>
                <TextInput
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Es. Lavoro, Sport..."
                  placeholderTextColor="#6b7280"
                  style={styles.createFolderInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.createFolderLabel}>Colore</Text>
                <View style={styles.createFolderRow}>
                  {FOLDER_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewFolderColor(c)}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        newFolderColor === c && styles.colorSwatchSelected
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.createFolderLabel}>Icona</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
                  {FOLDER_ICONS.map(i => (
                    <TouchableOpacity
                      key={i.name}
                      onPress={() => setNewFolderIcon(i.name)}
                      style={[
                        styles.iconOption,
                        newFolderIcon === i.name && [styles.iconOptionSelected, { borderColor: newFolderColor }]
                      ]}
                    >
                      <Ionicons name={i.name as any} size={24} color={newFolderIcon === i.name ? newFolderColor : THEME.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <FiltersSection filters={newFolderFilters} setFilters={setNewFolderFilters} />

                <TouchableOpacity
                  onPress={() => {
                    if (editingFolder) {
                      Alert.alert('Elimina Cartella', `Vuoi eliminare la cartella "${editingFolder.name}"? (Le task torneranno in "Tutte")`, [
                        { text: 'Annulla', style: 'cancel' },
                        {
                          text: 'Elimina', style: 'destructive', onPress: () => {
                            performDeleteFolder(editingFolder.name);
                            setEditFolderVisible(false);
                            setEditingFolder(null);
                          }
                        }
                      ]);
                    }
                  }}
                  style={styles.editFolderDeleteBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={styles.editFolderDeleteText}>Elimina cartella</Text>
                </TouchableOpacity>

                <View style={styles.createFolderActions}>
                  <TouchableOpacity style={styles.createFolderBtnSecondary} onPress={() => { setEditFolderVisible(false); setEditingFolder(null); }}>
                    <Text style={styles.createFolderBtnSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]}
                    onPress={handleSaveEditFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>Salva</Text>
                  </TouchableOpacity>
                </View>
              </View>
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <Modal visible={createFolderVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCreateFolderVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <ScrollView style={{ maxHeight: '100%' }} bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.createFolderCard}>
                <Text style={styles.createFolderTitle}>Nuova cartella</Text>

                <Text style={styles.createFolderLabel}>Nome</Text>
                <TextInput
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Es. Lavoro, Sport..."
                  placeholderTextColor="#6b7280"
                  style={styles.createFolderInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.createFolderLabel}>Colore</Text>
                <View style={styles.createFolderRow}>
                  {FOLDER_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewFolderColor(c)}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        newFolderColor === c && styles.colorSwatchSelected
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.createFolderLabel}>Icona</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
                  {FOLDER_ICONS.map(i => (
                    <TouchableOpacity
                      key={i.name}
                      onPress={() => setNewFolderIcon(i.name)}
                      style={[
                        styles.iconOption,
                        newFolderIcon === i.name && [styles.iconOptionSelected, { borderColor: newFolderColor }]
                      ]}
                    >
                      <Ionicons name={i.name as any} size={24} color={newFolderIcon === i.name ? newFolderColor : THEME.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <FiltersSection filters={newFolderFilters} setFilters={setNewFolderFilters} />

                <View style={styles.createFolderActions}>
                  <TouchableOpacity style={styles.createFolderBtnSecondary} onPress={() => setCreateFolderVisible(false)}>
                    <Text style={styles.createFolderBtnSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]}
                    onPress={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>Crea</Text>
                  </TouchableOpacity>
                </View>
              </View>
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const fStyles = StyleSheet.create({
  filterSection: {
    marginTop: 16,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    overflow: 'hidden',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textMuted,
  },
  filterBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#3A3A3C',
  },
  chipActive: {
    backgroundColor: '#3b82f6',
  },
  chipText: {
    fontSize: 13,
    color: THEME.textMuted,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  colorFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  colorFilterDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
});
