import { styles } from '@/components/index/indexStyles';
import { FOLDER_COLORS, FOLDER_ICONS, FolderFilters, FolderItem } from '@/lib/index/indexTypes';
import { VacationUmbrellaIcon } from '@/components/ui/vacation-umbrella-icon';
import { useHabits } from '@/lib/habits/Provider';
import { HABIT_PRIORITY_LEVELS, type HabitPriority, type HabitTipo } from '@/lib/habits/schema';
import { COLORS } from '@/components/modal/modalStyles';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

function getPriorityChipPalette(priority: HabitPriority) {
  if (priority === 'maximum') {
    return {
      chip: { borderColor: 'rgba(239, 68, 68, 0.55)', backgroundColor: 'rgba(239, 68, 68, 0.12)' },
      chipActive: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.28)' },
      icon: { color: '#fca5a5' },
      text: { color: '#fecaca' },
    };
  }
  if (priority === 'minimum') {
    return {
      chip: { borderColor: 'rgba(34, 197, 94, 0.55)', backgroundColor: 'rgba(34, 197, 94, 0.12)' },
      chipActive: { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.28)' },
      icon: { color: '#86efac' },
      text: { color: '#bbf7d0' },
    };
  }
  return {
    chip: { borderColor: 'rgba(245, 158, 11, 0.55)', backgroundColor: 'rgba(245, 158, 11, 0.12)' },
    chipActive: { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.28)' },
    icon: { color: '#fcd34d' },
    text: { color: '#fde68a' },
  };
}

function FiltersSection({ filters, setFilters }: { filters: FolderFilters; setFilters: (f: FolderFilters) => void }) {
  const { t } = useTranslation();
  const { tables, habits } = useHabits();
  const tipoOptions = useMemo(
    () =>
      [
        { value: 'task' as HabitTipo, label: t('modal.tipoTask'), icon: 'checkbox-outline' },
        { value: 'evento' as HabitTipo, label: t('modal.tipoEvent'), icon: 'calendar-outline' },
        { value: 'abitudine' as HabitTipo, label: t('modal.tipoHabit'), icon: 'repeat-outline' },
        { value: 'viaggio' as HabitTipo, label: t('modal.tipoTravel'), icon: 'airplane-outline' },
        { value: 'vacanza' as HabitTipo, label: t('modal.tipoVacation'), icon: undefined },
        { value: 'salute' as HabitTipo, label: t('modal.tipoHealth'), icon: 'heart-outline' },
      ] as const,
    [t]
  );
  const freqOptions = useMemo(
    () =>
      [
        { value: 'single' as const, label: t('modal.freqSingle') },
        { value: 'daily' as const, label: t('modal.freqDaily') },
        { value: 'weekly' as const, label: t('modal.freqWeekly') },
        { value: 'monthly' as const, label: t('modal.freqMonthly') },
        { value: 'annual' as const, label: t('modal.freqAnnual') },
      ] as const,
    [t]
  );
  const priorityOptions = useMemo(
    () =>
      HABIT_PRIORITY_LEVELS.map((priority) => ({
        value: priority,
        label:
          priority === 'maximum'
            ? t('modal.priorityMaximum')
            : priority === 'minimum'
              ? t('modal.priorityMinimum')
              : t('modal.priorityMedium'),
      })),
    [t]
  );
  const availableTables = useMemo(
    () => tables.filter((table) => table.name.trim().length > 0),
    [tables]
  );
  const availableFilterColors = useMemo(() => {
    const selectedTableIds = new Set(filters.tableIds ?? []);
    const includeAllTables = filters.allTables;
    const dynamicColors = new Set<string>();

    for (const table of tables) {
      if (includeAllTables || selectedTableIds.has(table.id)) {
        if (table.color) dynamicColors.add(table.color);
      }
    }

    for (const habit of habits) {
      const linkedTableId = habit.tableSeriesLink?.tableId;
      if (!linkedTableId) continue;
      if (includeAllTables || selectedTableIds.has(linkedTableId)) {
        if (habit.color) dynamicColors.add(habit.color);
      }
    }

    const ordered = [...COLORS];
    for (const color of filters.colors ?? []) {
      if (!ordered.includes(color)) ordered.push(color);
    }
    for (const color of dynamicColors) {
      if (!ordered.includes(color)) ordered.push(color);
    }
    return ordered;
  }, [filters.allTables, filters.colors, filters.tableIds, habits, tables]);
  const [expanded, setExpanded] = useState(
    !!(filters.tipos?.length || filters.colors?.length || filters.priorities?.length || filters.frequencies?.length || filters.allTables || filters.tableIds?.length)
  );

  const toggleTipo = (t: HabitTipo) => {
    const current = filters.tipos ?? [];
    const next = current.includes(t as any) ? current.filter(x => x !== t) : [...current, t];
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

  const togglePriority = (priority: HabitPriority) => {
    const current = filters.priorities ?? [];
    const next = current.includes(priority) ? current.filter(x => x !== priority) : [...current, priority];
    setFilters({ ...filters, priorities: next.length ? next : undefined });
  };

  const toggleAllTables = () => {
    if (filters.allTables) {
      setFilters({ ...filters, allTables: undefined, tableIds: undefined });
      return;
    }
    setFilters({ ...filters, allTables: true, tableIds: undefined });
  };

  const toggleTable = (tableId: string) => {
    const current = filters.tableIds ?? [];
    const next = current.includes(tableId) ? current.filter(id => id !== tableId) : [...current, tableId];
    setFilters({ ...filters, allTables: undefined, tableIds: next.length ? next : undefined });
  };

  const hasActiveFilters = !!(
    filters.tipos?.length ||
    filters.colors?.length ||
    filters.priorities?.length ||
    filters.frequencies?.length ||
    filters.allTables ||
    filters.tableIds?.length
  );
  const showTablesFilters = availableTables.length > 0 || filters.allTables || !!filters.tableIds?.length;

  return (
    <View style={fStyles.filterSection}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={fStyles.filterHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="funnel-outline" size={16} color={hasActiveFilters ? '#3b82f6' : THEME.textMuted} />
          <Text style={[fStyles.filterHeaderText, hasActiveFilters && { color: '#3b82f6' }]}>
            {hasActiveFilters ? t('folderModals.filtersActive') : t('folderModals.filters')}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={THEME.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={fStyles.filterBody}>
          <Text style={fStyles.filterLabel}>{t('modal.sectionType')}</Text>
          <View style={fStyles.chipRow}>
            {tipoOptions.map(opt => {
              const active = filters.tipos?.includes(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => toggleTipo(opt.value)}
                  style={[fStyles.chip, active && fStyles.chipActive]}
                >
                  {opt.value === 'vacanza' ? (
                    <VacationUmbrellaIcon size={16} />
                  ) : (
                    <Ionicons name={opt.icon as any} size={14} color={active ? '#fff' : THEME.textMuted} />
                  )}
                  <Text style={[fStyles.chipText, active && fStyles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {showTablesFilters && (
            <>
              <Text style={fStyles.filterLabel}>{t('folderModals.tablesLabel')}</Text>
              <View style={fStyles.chipRow}>
                <TouchableOpacity
                  onPress={toggleAllTables}
                  style={[fStyles.chip, filters.allTables && fStyles.chipActive]}
                >
                  <Ionicons name="grid-outline" size={14} color={filters.allTables ? '#fff' : THEME.textMuted} />
                  <Text style={[fStyles.chipText, filters.allTables && fStyles.chipTextActive]}>
                    {t('folderModals.allTables')}
                  </Text>
                </TouchableOpacity>

                {availableTables.map((table) => {
                  const active = filters.tableIds?.includes(table.id);
                  return (
                    <TouchableOpacity
                      key={table.id}
                      onPress={() => toggleTable(table.id)}
                      style={[fStyles.chip, active && fStyles.chipActive]}
                    >
                      <View style={[fStyles.tableDot, { backgroundColor: table.color }]} />
                      <Text style={[fStyles.chipText, active && fStyles.chipTextActive]} numberOfLines={1}>
                        {table.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Text style={fStyles.filterLabel}>{t('modal.sectionColor')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fStyles.colorFilterRow}>
            {availableFilterColors.map(c => {
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

          <Text style={fStyles.filterLabel}>{t('folderModals.priorityLabel')}</Text>
          <View style={fStyles.priorityChipRow}>
            {priorityOptions.map(opt => {
              const active = filters.priorities?.includes(opt.value);
              const palette = getPriorityChipPalette(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => togglePriority(opt.value)}
                  style={[
                    fStyles.priorityChip,
                    palette.chip,
                    active && palette.chipActive,
                  ]}
                >
                  <View
                    style={[
                      fStyles.priorityIndicator,
                      { borderColor: active ? '#ffffff' : palette.icon.color },
                      active && fStyles.priorityIndicatorActive,
                    ]}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      fStyles.priorityChipText,
                      palette.text,
                      active && fStyles.priorityChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={fStyles.filterLabel}>{t('folderModals.freqLabel')}</Text>
          <View style={fStyles.chipRow}>
            {freqOptions.map(opt => {
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
  const { t } = useTranslation();
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
                <Text style={styles.createFolderTitle}>{t('folderModals.editTitle')}</Text>

                <Text style={styles.createFolderLabel}>{t('common.nome')}</Text>
                <TextInput
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder={t('folderModals.namePh')}
                  placeholderTextColor="#6b7280"
                  style={styles.createFolderInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.createFolderLabel}>{t('modal.sectionColor')}</Text>
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

                <Text style={styles.createFolderLabel}>{t('folderModals.iconLabel')}</Text>
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
                      Alert.alert(
                        t('index.folderDeleteTitle'),
                        t('index.folderDeleteMessage', { name: editingFolder.name, all: t('common.tutte') }),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('common.delete'),
                            style: 'destructive',
                            onPress: () => {
                              performDeleteFolder(editingFolder.name);
                              setEditFolderVisible(false);
                              setEditingFolder(null);
                            },
                          },
                        ]
                      );
                    }
                  }}
                  style={styles.editFolderDeleteBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={styles.editFolderDeleteText}>{t('folderModals.deleteFolderRow')}</Text>
                </TouchableOpacity>

                <View style={styles.createFolderActions}>
                  <TouchableOpacity style={styles.createFolderBtnSecondary} onPress={() => { setEditFolderVisible(false); setEditingFolder(null); }}>
                    <Text style={styles.createFolderBtnSecondaryText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]}
                    onPress={handleSaveEditFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>{t('common.save')}</Text>
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
                <Text style={styles.createFolderTitle}>{t('folderModals.newTitle')}</Text>

                <Text style={styles.createFolderLabel}>{t('common.nome')}</Text>
                <TextInput
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder={t('folderModals.namePh')}
                  placeholderTextColor="#6b7280"
                  style={styles.createFolderInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.createFolderLabel}>{t('modal.sectionColor')}</Text>
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

                <Text style={styles.createFolderLabel}>{t('folderModals.iconLabel')}</Text>
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
                    <Text style={styles.createFolderBtnSecondaryText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]}
                    onPress={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>{t('folderModals.create')}</Text>
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
  priorityChipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
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
  priorityChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    color: THEME.textMuted,
  },
  priorityChipText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  priorityIndicator: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  priorityIndicatorActive: {
    backgroundColor: '#ffffff',
  },
  tableDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
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
