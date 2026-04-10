import { SKETCH_PLANNER } from '@/constants/sketchPlanner';
import { TableTaskCreateOverlay } from '@/components/index/TableTaskCreateOverlay';
import { useHabits } from '@/lib/habits/Provider';
import type { UserTable } from '@/lib/habits/schema';
import { DOMANI_TOMORROW_KEY, IERI_YESTERDAY_KEY, OGGI_TODAY_KEY, TUTTE_KEY } from '@/lib/index/indexTypes';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

const C = {
  canvas: '#000000',
  surface: '#0A0A0A',
  surfaceAlt: '#111111',
  border: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.48)',
  cellOff: '#3A3A3E',
  cellOn: '#30D158',
} as const;

const GRID = {
  rowHeaderWidth: 38,
  colWidth: 74,
  colHeight: 28,
  cellHeight: 28,
  gap: 4,
} as const;

const MAX_TABLE_COLUMNS = 10;

function getAdaptiveGap(columnCount: number): number {
  return GRID.gap;
}

function getThumbnailGap(columnCount: number): number {
  return 2;
}

function getReferenceLeftCellWidth(totalWidth: number, gap: number, minWidth: number): number {
  return Math.max(minWidth, Math.floor((totalWidth - MAX_TABLE_COLUMNS * gap) / (MAX_TABLE_COLUMNS + 1)));
}

type CreateTarget = {
  folder?: string;
  ymd?: string;
};

function normalizeChecked(table: UserTable): boolean[][] {
  const rowCount = Array.isArray(table.cells) ? table.cells.length : 0;
  const colCount = Array.isArray(table.headerRows?.[0]) ? table.headerRows[0].length : 0;
  return Array.from({ length: rowCount }, (_, ri) =>
    Array.from({ length: colCount }, (_, ci) => Boolean(table.checked?.[ri]?.[ci] ?? table.cells?.[ri]?.[ci]))
  );
}

function getColumnLabels(table: UserTable): string[] {
  const row = table.headerRows?.[0];
  if (Array.isArray(row)) return row;
  const colCount = Array.isArray(table.cells?.[0]) ? table.cells[0].length : 0;
  return Array.from({ length: colCount }, () => '');
}

function getCreateTarget(activeFolder: string | null | undefined, todayYmd: string, tomorrowYmd: string, yesterdayYmd: string): CreateTarget {
  if (!activeFolder || activeFolder === TUTTE_KEY) return {};
  if (activeFolder === DOMANI_TOMORROW_KEY) return { ymd: tomorrowYmd };
  if (activeFolder === IERI_YESTERDAY_KEY) return { ymd: yesterdayYmd };
  if (activeFolder === OGGI_TODAY_KEY) return { ymd: todayYmd };
  return { folder: activeFolder, ymd: todayYmd };
}

function buildTaskTitle(tableName: string, columnLabel: string, rowNumber: number, colNumber: number): string {
  const safeTable = tableName.trim();
  const safeColumn = columnLabel.trim() || `C${colNumber}`;
  return [safeTable, safeColumn, String(rowNumber)].filter(Boolean).join(' ');
}

function TableThumbnail({ table }: { table: UserTable }) {
  const checked = normalizeChecked(table);
  const totalColumns = Math.max(getColumnLabels(table).length, checked[0]?.length ?? 0, 1);
  const previewColumns = Math.min(totalColumns, MAX_TABLE_COLUMNS);
  const previewGap = getThumbnailGap(previewColumns);
  const previewTenColumnGap = getThumbnailGap(MAX_TABLE_COLUMNS);
  const maxPreviewRows = 5;
  const hasOverflowRows = checked.length > maxPreviewRows;
  const [thumbnailWidth, setThumbnailWidth] = useState(0);
  const rows = checked
    .slice(0, Math.min(checked.length, maxPreviewRows))
    .map((row) => Array.from({ length: previewColumns }, (_, index) => Boolean(row[index])));
  const accent = table.color;
  const indexCellSize = thumbnailWidth > 0
    ? getReferenceLeftCellWidth(thumbnailWidth, previewTenColumnGap, 4)
    : 12;
  const dataCellWidth = thumbnailWidth > 0
    ? Math.max(4, (thumbnailWidth - indexCellSize - previewColumns * previewGap) / previewColumns)
    : undefined;

  return (
    <View
      style={[thumbnail.root, { gap: previewGap }]}
      onLayout={(event) => {
        const nextWidth = Math.floor(event.nativeEvent.layout.width);
        if (nextWidth > 0 && nextWidth !== thumbnailWidth) {
          setThumbnailWidth(nextWidth);
        }
      }}
    >
      <View style={[thumbnail.row, { gap: previewGap }]}>
        <View style={[thumbnail.indexCell, { width: indexCellSize, height: indexCellSize, backgroundColor: accent }]} />
        {Array.from({ length: previewColumns }, (_, index) => (
          <View
            key={index}
            style={[thumbnail.fillCell, { width: dataCellWidth, height: indexCellSize, backgroundColor: accent }]}
          />
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={[thumbnail.row, { gap: previewGap }]}>
          <View
            style={[
              thumbnail.indexCell,
              { width: indexCellSize, height: indexCellSize, backgroundColor: accent },
            ]}
          />
          {row.map((isOn, ci) => (
            <View
              key={ci}
              style={[
                thumbnail.fillCell,
                { width: dataCellWidth, height: indexCellSize, backgroundColor: isOn ? C.cellOn : C.cellOff },
              ]}
            />
          ))}
        </View>
      ))}
      {hasOverflowRows ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
          style={thumbnail.fadeOverlay}
        />
      ) : null}
    </View>
  );
}

function TableCard({
  table,
  cardWidth,
  onPress,
  onLongPress,
}: {
  table: UserTable;
  cardWidth: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const cols = getColumnLabels(table).length;
  const rows = table.cells.length;
  return (
    <TouchableOpacity
      style={[cards.card, { width: cardWidth, borderTopColor: table.color }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      activeOpacity={0.82}
    >
      <View style={cards.preview}>
        <TableThumbnail table={table} />
      </View>
      <View style={cards.footer}>
        <Text style={cards.name} numberOfLines={1}>{table.name}</Text>
        <Text style={cards.meta} numberOfLines={1}>{rows} righe · {cols} colonne</Text>
      </View>
    </TouchableOpacity>
  );
}

const thumbnail = StyleSheet.create({
  root: {
    width: '100%',
    position: 'relative',
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
  },
  indexCell: {
    borderRadius: 2,
    flexShrink: 0,
  },
  fillCell: {
    borderRadius: 2,
    flexShrink: 0,
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 18,
  },
});

const cards = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderTopWidth: 4,
    overflow: 'hidden',
  },
  preview: {
    minHeight: 92,
    backgroundColor: C.canvas,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  name: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  meta: {
    color: C.muted,
    fontSize: 12,
    flexShrink: 0,
  },
});

const ACCENT_COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#BF5AF2', '#5E5CE6', '#64D2FF', '#F7D154'];

function CreateModal({ visible, onClose, onCreate }: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string, cols: number, rows: number) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(5);
  const [accent, setAccent] = useState(ACCENT_COLORS[1]);

  const reset = useCallback(() => {
    setName('');
    setCols(4);
    setRows(5);
    setAccent(ACCENT_COLORS[1]);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const canCreate = name.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={create.backdrop}>
          <View style={create.sheet}>
            <View style={create.handle} />
            <View style={create.header}>
              <TouchableOpacity onPress={close}><Text style={create.cancel}>{t('common.cancel')}</Text></TouchableOpacity>
              <Text style={create.title}>{t('tablesUi.newTableTitle')}</Text>
              <TouchableOpacity
                disabled={!canCreate}
                onPress={() => {
                  if (!canCreate) return;
                  onCreate(name.trim(), accent, cols, rows);
                  reset();
                  onClose();
                }}
              >
                <Text style={[create.done, !canCreate && { opacity: 0.35 }]}>{t('tablesUi.create')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 }}>
              <Text style={create.label}>{t('tablesUi.nameLabel')}</Text>
              <TextInput
                style={create.input}
                value={name}
                onChangeText={setName}
                placeholder={t('tablesUi.namePh')}
                placeholderTextColor={C.muted}
                autoFocus
              />

              <Text style={create.label}>{t('tablesUi.colorLabel')}</Text>
              <View style={create.colors}>
                {ACCENT_COLORS.map((color) => (
                  <TouchableOpacity key={color} onPress={() => setAccent(color)}>
                    <View style={[create.swatch, { backgroundColor: color }, accent === color && create.swatchSelected]} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={create.label}>{t('tablesUi.sizeLabel')}</Text>
              <View style={create.sizeRow}>
                <View style={create.sizeCard}>
                  <Text style={create.sizeText}>{t('tablesUi.columns')}</Text>
                  <View style={create.stepper}>
                    <TouchableOpacity style={create.stepButton} onPress={() => setCols((value) => Math.max(1, value - 1))}>
                      <Text style={create.stepLabel}>−</Text>
                    </TouchableOpacity>
                    <Text style={create.value}>{cols}</Text>
                    <TouchableOpacity style={create.stepButton} onPress={() => setCols((value) => Math.min(10, value + 1))}>
                      <Text style={create.stepLabel}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={create.sizeCard}>
                  <Text style={create.sizeText}>{t('tablesUi.rowsLabel')}</Text>
                  <View style={create.stepper}>
                    <TouchableOpacity style={create.stepButton} onPress={() => setRows((value) => Math.max(1, value - 1))}>
                      <Text style={create.stepLabel}>−</Text>
                    </TouchableOpacity>
                    <Text style={create.value}>{rows}</Text>
                    <TouchableOpacity style={create.stepButton} onPress={() => setRows((value) => Math.min(20, value + 1))}>
                      <Text style={create.stepLabel}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const create = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.canvas, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8, maxHeight: '85%' },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: '#4B4B4F', alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  title: { color: C.text, fontSize: 17, fontWeight: '700' },
  cancel: { color: C.muted, fontSize: 17 },
  done: { color: SKETCH_PLANNER.highlight, fontSize: 17, fontWeight: '700' },
  label: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: C.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 16 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchSelected: { borderWidth: 2.5, borderColor: '#FFFFFF' },
  sizeRow: { flexDirection: 'row', gap: 12 },
  sizeCard: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 14, padding: 14, alignItems: 'center', gap: 10 },
  sizeText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2D2D31', alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: C.text, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  value: { color: C.text, fontSize: 22, fontWeight: '800', minWidth: 28, textAlign: 'center' },
});

function SpreadsheetView({
  table,
  onUpdate,
  onClose,
  createTarget,
  todayYmd,
}: {
  table: UserTable;
  onUpdate: (patch: Partial<Omit<UserTable, 'id' | 'createdAt'>>) => void;
  onClose: () => void;
  createTarget: CreateTarget;
  todayYmd: string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const columnLabels = useMemo(() => getColumnLabels(table), [table]);
  const [labels, setLabels] = useState(columnLabels);
  const [checked, setChecked] = useState(() => normalizeChecked(table));
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [taskModalTitle, setTaskModalTitle] = useState<string | null>(null);
  const gridGap = getAdaptiveGap(labels.length);
  const tenColumnGap = getAdaptiveGap(MAX_TABLE_COLUMNS);
  const rowHeaderWidth = useMemo(() => {
    const horizontalPadding = 4;
    const gridWidth = screenWidth - horizontalPadding;
    return getReferenceLeftCellWidth(gridWidth, tenColumnGap, 22);
  }, [screenWidth, tenColumnGap]);
  const cellSize = rowHeaderWidth;
  const columnWidth = useMemo(() => {
    const horizontalPadding = 4;
    const gridWidth = screenWidth - horizontalPadding;
    const usable = gridWidth - rowHeaderWidth - (labels.length * gridGap);
    return Math.max(22, Math.floor(usable / Math.max(labels.length, 1)));
  }, [gridGap, labels.length, rowHeaderWidth, screenWidth]);
  const compactColumns = labels.length >= 9;

  useEffect(() => {
    setLabels(columnLabels);
    setChecked(normalizeChecked(table));
    setEditingCol(null);
    setDraftLabel('');
  }, [columnLabels, table]);

  const persist = useCallback((nextLabels: string[], nextChecked: boolean[][]) => {
    onUpdate({
      headerRows: [nextLabels],
      cells: nextChecked.map((row) => row.map((value) => (value ? '1' : ''))),
      checked: nextChecked,
    });
  }, [onUpdate]);

  const toggleCell = useCallback((rowIndex: number, colIndex: number) => {
    const next = checked.map((row) => [...row]);
    next[rowIndex][colIndex] = !next[rowIndex][colIndex];
    setChecked(next);
    persist(labels, next);
  }, [checked, labels, persist]);

  const beginEditColumn = useCallback((colIndex: number) => {
    setEditingCol(colIndex);
    setDraftLabel(labels[colIndex] ?? '');
  }, [labels]);

  const saveColumnLabel = useCallback(() => {
    if (editingCol == null) return;
    const nextLabels = [...labels];
    nextLabels[editingCol] = draftLabel.trim();
    setLabels(nextLabels);
    persist(nextLabels, checked);
    setEditingCol(null);
    setDraftLabel('');
  }, [checked, draftLabel, editingCol, labels, persist]);

  const addRow = useCallback(() => {
    const nextChecked = [...checked, Array(labels.length).fill(false)];
    setChecked(nextChecked);
    persist(labels, nextChecked);
  }, [checked, labels, persist]);

  const removeRow = useCallback(() => {
    if (checked.length <= 1) return;
    const nextChecked = checked.slice(0, -1);
    setChecked(nextChecked);
    persist(labels, nextChecked);
  }, [checked, labels, persist]);

  const addColumn = useCallback(() => {
    if (labels.length >= 10) return;
    const nextLabels = [...labels, ''];
    const nextChecked = checked.map((row) => [...row, false]);
    setLabels(nextLabels);
    setChecked(nextChecked);
    persist(nextLabels, nextChecked);
  }, [checked, labels, persist]);

  const removeColumn = useCallback(() => {
    if (labels.length <= 1) return;
    const nextLabels = labels.slice(0, -1);
    const nextChecked = checked.map((row) => row.slice(0, -1));
    setLabels(nextLabels);
    setChecked(nextChecked);
    persist(nextLabels, nextChecked);
  }, [checked, labels, persist]);

  const openCreateTask = useCallback((rowIndex: number, colIndex: number) => {
    const rowNumber = rowIndex + 1;
    const title = buildTaskTitle(table.name, labels[colIndex] ?? '', rowNumber, colIndex + 1);
    setTaskModalTitle(title);
  }, [labels, table.name]);

  const showInfo = useCallback(() => {
    Alert.alert(
      'Come funziona',
      'Tocca una casella per farla diventare verde. Tieni premuto su una casella per creare una task con titolo colonna + riga.'
    );
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={sheet.container}>
        <View style={sheet.topBar}>
          <TouchableOpacity style={sheet.backButton} onPress={onClose}>
            <Ionicons name="chevron-back" size={22} color={table.color} />
            <Text style={[sheet.backText, { color: table.color }]}>Tabelle</Text>
          </TouchableOpacity>
          <Text style={sheet.title} numberOfLines={1}>{table.name}</Text>
          <View style={sheet.topActions}>
            <TouchableOpacity style={sheet.iconButton} onPress={showInfo}>
              <Ionicons
                name={Platform.OS === 'ios' ? 'information-circle' : 'information-circle-outline'}
                size={20}
                color={C.text}
              />
            </TouchableOpacity>
            <TouchableOpacity style={[sheet.iconButton, checked.length <= 1 && sheet.iconButtonDisabled]} onPress={removeRow} disabled={checked.length <= 1}>
              <Ionicons name="remove" size={18} color={C.text} />
              <Text style={sheet.iconLabel}>R</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sheet.iconButton} onPress={addRow}>
              <Ionicons name="add" size={18} color={C.text} />
              <Text style={sheet.iconLabel}>R</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sheet.iconButton, labels.length <= 1 && sheet.iconButtonDisabled]} onPress={removeColumn} disabled={labels.length <= 1}>
              <Ionicons name="remove" size={18} color={C.text} />
              <Text style={sheet.iconLabel}>C</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sheet.iconButton, labels.length >= 10 && sheet.iconButtonDisabled]} onPress={addColumn} disabled={labels.length >= 10}>
              <Ionicons name="add" size={18} color={C.text} />
              <Text style={sheet.iconLabel}>C</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={sheet.gridOuter}>
          <View style={sheet.gridWrap}>
            <View style={[sheet.headerRow, { gap: gridGap }]}>
              <View style={[sheet.cornerCell, { width: rowHeaderWidth, height: cellSize, backgroundColor: table.color }]} />
              {labels.map((label, colIndex) => (
                <Pressable
                  key={`header-${colIndex}`}
                  style={[sheet.columnHeader, { backgroundColor: table.color, width: columnWidth, height: cellSize }]}
                  onPress={() => beginEditColumn(colIndex)}
                >
                  {editingCol === colIndex ? (
                    <TextInput
                      value={draftLabel}
                      onChangeText={setDraftLabel}
                      onBlur={saveColumnLabel}
                      onSubmitEditing={saveColumnLabel}
                      autoFocus
                      placeholder={`C${colIndex + 1}`}
                      placeholderTextColor="rgba(0,0,0,0.45)"
                      style={[sheet.columnInput, compactColumns && sheet.columnInputCompact]}
                      returnKeyType="done"
                      maxLength={24}
                    />
                  ) : (
                    <Text style={[sheet.columnHeaderText, compactColumns && sheet.columnHeaderTextCompact]} numberOfLines={1}>
                      {label.trim() || `C${colIndex + 1}`}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={sheet.rowsContent}>
              {checked.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={[sheet.bodyRow, { gap: gridGap }]}>
                  <View style={[sheet.rowHeader, { width: rowHeaderWidth, height: cellSize, backgroundColor: table.color }]}>
                    <Text style={sheet.rowHeaderText}>{rowIndex + 1}</Text>
                  </View>
                  {row.map((isOn, colIndex) => (
                    <Pressable
                      key={`cell-${rowIndex}-${colIndex}`}
                      style={[sheet.cell, { width: columnWidth, height: cellSize }, isOn ? sheet.cellOn : sheet.cellOff]}
                      onPress={() => toggleCell(rowIndex, colIndex)}
                      onLongPress={() => openCreateTask(rowIndex, colIndex)}
                      delayLongPress={340}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        {taskModalTitle ? (
          <TableTaskCreateOverlay
            title={taskModalTitle}
            defaultFolder={createTarget.folder}
            defaultYmd={createTarget.ymd ?? todayYmd}
            defaultTaskHasTime={Boolean(createTarget.ymd)}
            onClose={() => setTaskModalTitle(null)}
          />
        ) : null}

      </View>
    </Modal>
  );
}

const sheet = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.canvas },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 10,
    paddingHorizontal: 10,
    gap: 10,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 78 },
  backText: { fontSize: 17, fontWeight: '600' },
  title: { flex: 1, color: C.text, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  topActions: { flexDirection: 'row', gap: 6, minWidth: 78, justifyContent: 'flex-end' },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  iconLabel: {
    position: 'absolute',
    bottom: 3,
    right: 4,
    fontSize: 9,
    color: C.muted,
    fontWeight: '700',
  },
  gridOuter: { flex: 1, paddingHorizontal: 2, paddingBottom: 26 },
  gridWrap: { minHeight: '100%' },
  headerRow: { flexDirection: 'row', marginBottom: GRID.gap },
  rowsContent: { paddingBottom: 80 },
  bodyRow: { flexDirection: 'row', marginBottom: GRID.gap },
  cornerCell: {
    width: GRID.rowHeaderWidth,
    height: GRID.colHeight,
    borderRadius: 4,
  },
  columnHeader: {
    width: GRID.colWidth,
    height: GRID.colHeight,
    borderRadius: 4,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  columnHeaderText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  columnHeaderTextCompact: {
    fontSize: 10,
  },
  columnInput: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    padding: 0,
  },
  columnInputCompact: {
    fontSize: 10,
  },
  rowHeader: {
    width: GRID.rowHeaderWidth,
    height: GRID.cellHeight,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowHeaderText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  cell: {
    width: GRID.colWidth,
    height: GRID.cellHeight,
    borderRadius: 4,
  },
  cellOff: {
    backgroundColor: C.cellOff,
  },
  cellOn: {
    backgroundColor: C.cellOn,
  },
});

export default function TabelleView({
  activeFolder,
  todayYmd,
  tomorrowYmd,
  yesterdayYmd,
}: {
  activeFolder?: string | null;
  todayYmd: string;
  tomorrowYmd: string;
  yesterdayYmd: string;
}) {
  const { t } = useTranslation();
  const { tables, addTable, updateTable, deleteTable } = useHabits();
  const { width: screenWidth } = useWindowDimensions();
  const [showCreate, setShowCreate] = useState(false);
  const [openTable, setOpenTable] = useState<UserTable | null>(null);
  const [containerWidth, setContainerWidth] = useState(screenWidth);

  const createTarget = useMemo(
    () => getCreateTarget(activeFolder, todayYmd, tomorrowYmd, yesterdayYmd),
    [activeFolder, todayYmd, tomorrowYmd, yesterdayYmd]
  );
  const cardWidth = useMemo(() => {
    const availableWidth = containerWidth > 0 ? containerWidth : screenWidth;
    const horizontalPadding = 8;
    const gap = 12;
    const minCardWidth = 156;
    const columns = Math.min(2, Math.max(1, Math.floor((availableWidth - horizontalPadding + gap) / (minCardWidth + gap))));
    return Math.floor((availableWidth - horizontalPadding - gap * (columns - 1)) / columns);
  }, [containerWidth, screenWidth]);
  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== containerWidth) {
      setContainerWidth(nextWidth);
    }
  }, [containerWidth]);

  const handleDelete = useCallback((table: UserTable) => {
    Alert.alert(t('index.tableDeleteTitle'), t('index.tableDeleteMessage', { name: table.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteTable(table.id) },
    ]);
  }, [deleteTable, t]);

  return (
    <View style={main.container} onLayout={handleContainerLayout}>
      <View style={main.toolbar}>
        <Text style={main.toolbarSub}>
          {tables.length > 0
            ? tables.length === 1
              ? t('tablesUi.countOne')
              : t('tablesUi.countMany', { count: tables.length })
            : ''}
        </Text>
      </View>

      {tables.length === 0 ? (
        <View style={main.empty}>
          <View style={main.emptyIcon}><Ionicons name="grid-outline" size={44} color="rgba(255,255,255,0.22)" /></View>
          <Text style={main.emptyTitle}>{t('tablesUi.emptyTitle')}</Text>
          <Text style={main.emptyHint}>{t('tablesUi.emptyHint')}</Text>
          <TouchableOpacity style={main.emptyButton} onPress={() => setShowCreate(true)}>
            <Text style={main.emptyButtonText}>{t('tablesUi.createTable')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={main.grid}>
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              cardWidth={cardWidth}
              onPress={() => setOpenTable(table)}
              onLongPress={() => handleDelete(table)}
            />
          ))}
        </ScrollView>
      )}

      <CreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(name, color, cols, rows) => addTable(name, color, cols, rows)}
      />

      {openTable ? (
        <SpreadsheetView
          table={openTable}
          createTarget={createTarget}
          todayYmd={todayYmd}
          onUpdate={(patch) => {
            updateTable(openTable.id, patch);
            setOpenTable((current) => (current ? { ...current, ...patch } : null));
          }}
          onClose={() => setOpenTable(null)}
        />
      ) : null}

      <View style={main.fabLayer} pointerEvents="box-none">
        <TouchableOpacity style={main.fabShell} onPress={() => setShowCreate(true)}>
          <BlurView intensity={80} tint="systemChromeMaterialDark" style={main.fab}>
            <Ionicons name="add" size={40} color={SKETCH_PLANNER.highlight} />
          </BlurView>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.canvas },
  toolbar: { paddingHorizontal: 4, paddingVertical: 4 },
  toolbarSub: { color: C.muted, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  emptyHint: { color: C.muted, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  emptyButton: { marginTop: 12, backgroundColor: SKETCH_PLANNER.highlight, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 },
  emptyButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 120, alignContent: 'flex-start' },
  fabLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fabShell: {
    position: 'absolute',
    right: 20,
    bottom: 98,
    width: 83,
    height: 83,
    borderRadius: 42,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  fab: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
