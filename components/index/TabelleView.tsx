import { SKETCH_PLANNER } from '@/constants/sketchPlanner';
import { styles as indexStyles } from '@/components/index/indexStyles';
import { TableTaskCreateOverlay } from '@/components/index/TableTaskCreateOverlay';
import { useHabits } from '@/lib/habits/Provider';
import type { UserTable } from '@/lib/habits/schema';
import { DOMANI_TOMORROW_KEY, IERI_YESTERDAY_KEY, OGGI_TODAY_KEY, TUTTE_KEY } from '@/lib/index/indexTypes';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  Easing,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const GLASS_EFFECT = { style: 'regular', animate: true, animationDuration: 0.26 } as const;

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

function isRealFolder(activeFolder: string | null | undefined): activeFolder is string {
  return Boolean(
    activeFolder &&
    activeFolder !== TUTTE_KEY &&
    activeFolder !== OGGI_TODAY_KEY &&
    activeFolder !== DOMANI_TOMORROW_KEY &&
    activeFolder !== IERI_YESTERDAY_KEY
  );
}

function buildTaskTitle(tableName: string, columnLabel: string, rowNumber: number, colNumber: number): string {
  const safeTable = tableName.trim();
  const safeColumn = columnLabel.trim() || `C${colNumber}`;
  return [safeTable, safeColumn, String(rowNumber)].filter(Boolean).join(' ');
}

function getInitialModalCols(table?: UserTable | null): number {
  if (!table) return 4;
  return Math.max(1, getColumnLabels(table).length || 4);
}

function getInitialModalRows(table?: UserTable | null): number {
  if (!table) return 4;
  return Math.max(1, Array.isArray(table.cells) ? table.cells.length : 4);
}

function resizeTablePatch(table: UserTable, name: string, color: string, cols: number, rows: number): Partial<Omit<UserTable, 'id' | 'createdAt'>> {
  const safeCols = Math.max(1, Math.min(10, Math.floor(cols)));
  const safeRows = Math.max(1, Math.min(20, Math.floor(rows)));
  const currentLabels = getColumnLabels(table);
  const currentChecked = normalizeChecked(table);

  const nextLabels = Array.from({ length: safeCols }, (_, index) => currentLabels[index] ?? '');
  const nextChecked = Array.from({ length: safeRows }, (_, rowIndex) =>
    Array.from({ length: safeCols }, (_, colIndex) => Boolean(currentChecked[rowIndex]?.[colIndex]))
  );

  return {
    name,
    color,
    headerRows: [nextLabels],
    headerCols: Array.from({ length: safeRows }, (_, index) => [String(index + 1)]),
    cells: nextChecked.map((row) => row.map((value) => (value ? '1' : ''))),
    checked: nextChecked,
  };
}

function TableThumbnail({
  table,
  availableWidth,
}: {
  table: UserTable;
  availableWidth: number;
}) {
  const checked = normalizeChecked(table);
  const totalColumns = Math.max(getColumnLabels(table).length, checked[0]?.length ?? 0, 1);
  const previewColumns = Math.min(totalColumns, MAX_TABLE_COLUMNS);
  const previewGap = getThumbnailGap(previewColumns);
  const previewTenColumnGap = getThumbnailGap(MAX_TABLE_COLUMNS);
  const maxPreviewRows = 5;
  const hasOverflowRows = checked.length > maxPreviewRows;
  const rows = checked
    .slice(0, Math.min(checked.length, maxPreviewRows))
    .map((row) => Array.from({ length: previewColumns }, (_, index) => Boolean(row[index])));
  const accent = table.color;
  const thumbnailWidth = Math.max(0, Math.floor(availableWidth));
  const indexCellSize = thumbnailWidth > 0
    ? getReferenceLeftCellWidth(thumbnailWidth, previewTenColumnGap, 4)
    : 12;
  const dataCellWidth = thumbnailWidth > 0
    ? Math.max(4, (thumbnailWidth - indexCellSize - previewColumns * previewGap) / previewColumns)
    : 4;

  return (
    <View style={[thumbnail.root, { gap: previewGap }]}>
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
  selected,
  selectionMode,
  onPress,
  onLongPress,
}: {
  table: UserTable;
  cardWidth: number;
  selected: boolean;
  selectionMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const cols = getColumnLabels(table).length;
  const rows = table.cells.length;
  const previewWidth = Math.max(0, cardWidth - 24);
  return (
    <TouchableOpacity
      style={[
        cards.card,
        { width: cardWidth, borderTopColor: table.color },
        selected && cards.cardSelected,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      activeOpacity={0.82}
    >
      {selectionMode ? (
        <View style={[cards.selectionBadge, selected && cards.selectionBadgeActive]}>
          <Ionicons name={selected ? 'checkmark' : 'ellipse-outline'} size={14} color="#FFFFFF" />
        </View>
      ) : null}
      <View style={cards.preview}>
        <TableThumbnail table={table} availableWidth={previewWidth} />
      </View>
      <View style={cards.footer}>
        <Text style={cards.name} numberOfLines={1}>{table.name}</Text>
        <Text style={cards.meta} numberOfLines={1}>{rows}/{cols}</Text>
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
  cardSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  selectionBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  selectionBadgeActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
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
    color: C.text,
    fontSize: 12,
    flexShrink: 0,
  },
});

function hueToHex(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const c = 1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHue(hex: string): number {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return 0;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  if (max === r) return 60 * (((g - b) / delta + 6) % 6);
  if (max === g) return 60 * ((b - r) / delta + 2);
  return 60 * ((r - g) / delta + 4);
}

const MIN_SLIDER_COLOR = '#6B6B72';
const MAX_SLIDER_COLOR = '#FFFFFF';
const DEFAULT_TABLE_COLOR = MIN_SLIDER_COLOR;
const COLOR_SLIDER_MAX = 1000;
const EDGE_TINT_RANGE = 80;

function mixHexColors(from: string, to: string, amount: number): string {
  const clamp = Math.max(0, Math.min(1, amount));
  const a = from.replace('#', '');
  const b = to.replace('#', '');
  const channels = [0, 2, 4].map((index) => {
    const start = parseInt(a.slice(index, index + 2), 16);
    const end = parseInt(b.slice(index, index + 2), 16);
    return Math.round(start + (end - start) * clamp).toString(16).padStart(2, '0').toUpperCase();
  });
  return `#${channels.join('')}`;
}

function sliderToColor(value: number): string {
  const clamped = Math.max(0, Math.min(COLOR_SLIDER_MAX, value));
  if (clamped <= EDGE_TINT_RANGE) {
    return mixHexColors(MIN_SLIDER_COLOR, DEFAULT_TABLE_COLOR, clamped / EDGE_TINT_RANGE);
  }
  if (clamped >= COLOR_SLIDER_MAX - EDGE_TINT_RANGE) {
    return mixHexColors('#BF5AF2', MAX_SLIDER_COLOR, (clamped - (COLOR_SLIDER_MAX - EDGE_TINT_RANGE)) / EDGE_TINT_RANGE);
  }
  const hue = ((clamped - EDGE_TINT_RANGE) / (COLOR_SLIDER_MAX - EDGE_TINT_RANGE * 2)) * 360;
  return hueToHex(hue);
}

function colorToSlider(hex: string): number {
  const normalized = hex.replace('#', '').toUpperCase();
  if (normalized.length !== 6) return EDGE_TINT_RANGE;
  if (normalized === MIN_SLIDER_COLOR.replace('#', '')) return 0;
  if (normalized === MAX_SLIDER_COLOR.replace('#', '')) return COLOR_SLIDER_MAX;
  const hue = hexToHue(hex);
  return Math.round(EDGE_TINT_RANGE + (hue / 360) * (COLOR_SLIDER_MAX - EDGE_TINT_RANGE * 2));
}

const COLOR_BAR_STOPS = [
  0,
  EDGE_TINT_RANGE,
  EDGE_TINT_RANGE + (COLOR_SLIDER_MAX - EDGE_TINT_RANGE * 2) * 0.16,
  EDGE_TINT_RANGE + (COLOR_SLIDER_MAX - EDGE_TINT_RANGE * 2) * 0.33,
  EDGE_TINT_RANGE + (COLOR_SLIDER_MAX - EDGE_TINT_RANGE * 2) * 0.5,
  EDGE_TINT_RANGE + (COLOR_SLIDER_MAX - EDGE_TINT_RANGE * 2) * 0.66,
  EDGE_TINT_RANGE + (COLOR_SLIDER_MAX - EDGE_TINT_RANGE * 2) * 0.83,
  COLOR_SLIDER_MAX - EDGE_TINT_RANGE,
  COLOR_SLIDER_MAX,
];

const CHROMATIC_BAR = COLOR_BAR_STOPS.map((stop) => sliderToColor(stop));
const CHROMATIC_LOCATIONS = COLOR_BAR_STOPS.map((stop) => stop / COLOR_SLIDER_MAX);

function CreateModal({ visible, onClose, onSubmit, initialTable }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, color: string, cols: number, rows: number) => void;
  initialTable?: UserTable | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [accentSliderValue, setAccentSliderValue] = useState(() => colorToSlider(DEFAULT_TABLE_COLOR));
  const [isMounted, setIsMounted] = useState(visible);
  const backdropProgress = React.useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetProgress = React.useRef(new Animated.Value(visible ? 1 : 0)).current;
  const accent = useMemo(() => sliderToColor(accentSliderValue), [accentSliderValue]);
  const isEditing = Boolean(initialTable);

  const reset = useCallback(() => {
    setName(initialTable?.name ?? '');
    setCols(getInitialModalCols(initialTable));
    setRows(getInitialModalRows(initialTable));
    setAccentSliderValue(colorToSlider(initialTable?.color ?? DEFAULT_TABLE_COLOR));
  }, [initialTable]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const canCreate = name.trim().length > 0;

  useEffect(() => {
    backdropProgress.stopAnimation();
    sheetProgress.stopAnimation();

    if (visible) {
      reset();
      setIsMounted(true);
      backdropProgress.setValue(0);
      sheetProgress.setValue(0);
      Animated.parallel([
        Animated.timing(backdropProgress, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(sheetProgress, {
          toValue: 1,
          damping: 22,
          mass: 0.92,
          stiffness: 210,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!isMounted) return;

    Animated.parallel([
      Animated.timing(backdropProgress, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetProgress, {
        toValue: 0,
        duration: 220,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setIsMounted(false);
    });
  }, [backdropProgress, isMounted, reset, sheetProgress, visible]);

  const backdropOpacity = backdropProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const sheetTranslateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [44, 0],
  });
  const sheetOpacity = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.74, 1],
  });
  if (!isMounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View style={[create.backdrop, { opacity: backdropOpacity }]}>
          <Animated.View style={[create.sheet, { opacity: sheetOpacity, transform: [{ translateY: sheetTranslateY }] }]}>
            <View style={create.handle} />
            <View style={create.header}>
              <TouchableOpacity onPress={close}><Text style={create.cancel}>{t('common.cancel')}</Text></TouchableOpacity>
              <Text style={create.title}>{isEditing ? 'Modifica tabella' : t('tablesUi.newTableTitle')}</Text>
              <TouchableOpacity
                disabled={!canCreate}
                onPress={() => {
                  if (!canCreate) return;
                  onSubmit(name.trim(), accent, cols, rows);
                  onClose();
                }}
              >
                <Text style={[create.done, !canCreate && { opacity: 0.35 }]}>{isEditing ? t('common.save') : t('tablesUi.create')}</Text>
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
              <View style={create.colorSliderWrap}>
                <LinearGradient
                  colors={CHROMATIC_BAR}
                  locations={CHROMATIC_LOCATIONS}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={create.colorTrack}
                />
                <Slider
                  style={create.colorSlider}
                  minimumValue={0}
                  maximumValue={COLOR_SLIDER_MAX}
                  value={accentSliderValue}
                  minimumTrackTintColor="transparent"
                  maximumTrackTintColor="transparent"
                  thumbTintColor={accent}
                  onValueChange={setAccentSliderValue}
                />
              </View>

              <Text style={[create.label, create.sizeLabel]}>{t('tablesUi.sizeLabel')}</Text>
              <View style={create.sizeRow}>
                <View style={[create.sizeCard, create.sizeCardLeft, { backgroundColor: accent }]}>
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

                <View style={[create.sizeCard, create.sizeCardRight, { backgroundColor: accent }]}>
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
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
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
  label: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: 18, marginBottom: 4 },
  sizeLabel: { marginTop: 10 },
  input: { backgroundColor: C.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 16 },
  colorSliderWrap: {
    justifyContent: 'center',
    height: 36,
    marginHorizontal: 12,
  },
  colorTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 12,
    borderRadius: 999,
  },
  colorSlider: {
    height: 36,
  },
  sizeRow: { flexDirection: 'row', gap: 0 },
  sizeCard: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 14, padding: 14, alignItems: 'center', gap: 10 },
  sizeCardLeft: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    marginRight: -1,
  },
  sizeCardRight: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  sizeText: { color: '#000000', fontSize: 13, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  value: { color: '#000000', fontSize: 22, fontWeight: '800', minWidth: 28, textAlign: 'center' },
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
  const insets = useSafeAreaInsets();
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                sheet.rowsContent,
                { paddingBottom: 118 + insets.bottom },
              ]}
            >
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

        <View
          pointerEvents="box-none"
          style={[
            sheet.floatingActionsWrap,
            { right: 14, bottom: 6 },
          ]}
        >
          <View style={sheet.floatingActions}>
            <View style={sheet.rowActions}>
              <TouchableOpacity style={sheet.floatingButton} onPress={addRow}>
                <Ionicons name="add" size={18} color={C.text} />
                <Text style={sheet.floatingButtonLabel}>Riga</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sheet.floatingButton, checked.length <= 1 && sheet.floatingButtonDisabled]}
                onPress={removeRow}
                disabled={checked.length <= 1}
              >
                <Ionicons name="remove" size={18} color={C.text} />
                <Text style={sheet.floatingButtonLabel}>Riga</Text>
              </TouchableOpacity>
            </View>
            <View style={sheet.columnActions}>
              <TouchableOpacity
                style={[sheet.floatingButton, labels.length >= 10 && sheet.floatingButtonDisabled]}
                onPress={addColumn}
                disabled={labels.length >= 10}
              >
                <Ionicons name="add" size={18} color={C.text} />
                <Text style={sheet.floatingButtonLabel}>Col</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sheet.floatingButton, labels.length <= 1 && sheet.floatingButtonDisabled]}
                onPress={removeColumn}
                disabled={labels.length <= 1}
              >
                <Ionicons name="remove" size={18} color={C.text} />
                <Text style={sheet.floatingButtonLabel}>Col</Text>
              </TouchableOpacity>
            </View>
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
  floatingActionsWrap: {
    position: 'absolute',
  },
  floatingActions: {
    width: 232,
    height: 124,
  },
  rowActions: {
    position: 'absolute',
    top: 0,
    right: 0,
    gap: 8,
    alignItems: 'flex-end',
  },
  columnActions: {
    position: 'absolute',
    right: 80,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
  },
  floatingButton: {
    width: 72,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(10,10,10,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  floatingButtonDisabled: {
    opacity: 0.35,
  },
  floatingButtonLabel: {
    color: C.text,
    fontSize: 11,
    fontWeight: '700',
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
  const [editingTable, setEditingTable] = useState<UserTable | null>(null);
  const [openTable, setOpenTable] = useState<UserTable | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [containerWidth, setContainerWidth] = useState(screenWidth);

  const createTarget = useMemo(
    () => getCreateTarget(activeFolder, todayYmd, tomorrowYmd, yesterdayYmd),
    [activeFolder, todayYmd, tomorrowYmd, yesterdayYmd]
  );
  const filteredTables = useMemo(() => {
    if (!isRealFolder(activeFolder)) return tables;
    const normalizedFolder = activeFolder.trim();
    return tables.filter((table) => (table.folder ?? '').trim() === normalizedFolder);
  }, [activeFolder, tables]);
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

  const toggleSelectedTable = useCallback((tableId: string) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedTableIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedTableIds.size === 0) return;
    const idsToDelete = Array.from(selectedTableIds);
    Alert.alert(
      t('index.tableDeleteTitle'),
      idsToDelete.length === 1 ? 'Eliminare la tabella selezionata?' : `Eliminare ${idsToDelete.length} tabelle selezionate?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            idsToDelete.forEach((id) => deleteTable(id));
            exitSelectionMode();
          },
        },
      ],
    );
  }, [deleteTable, exitSelectionMode, selectedTableIds, t]);

  const openEditModal = useCallback((table: UserTable) => {
    setEditingTable(table);
    setShowCreate(true);
  }, []);

  const closeEditor = useCallback(() => {
    setShowCreate(false);
    setEditingTable(null);
  }, []);

  const handleCardPress = useCallback((table: UserTable) => {
    if (selectionMode) {
      toggleSelectedTable(table.id);
      return;
    }
    setOpenTable(table);
  }, [selectionMode, toggleSelectedTable]);

  const handleCardLongPress = useCallback((table: UserTable) => {
    if (selectionMode) {
      toggleSelectedTable(table.id);
      return;
    }
    openEditModal(table);
  }, [openEditModal, selectionMode, toggleSelectedTable]);

  return (
    <View style={main.container} onLayout={handleContainerLayout}>
      <View style={main.toolbar}>
        <View style={main.toolbarRow}>
          {selectionMode ? (
            <Text style={main.toolbarSub}>
              {selectedTableIds.size > 0
                ? `${selectedTableIds.size} selezionate`
                : 'Seleziona tabelle'}
            </Text>
          ) : (
            <View style={main.toolbarSubPlaceholder} />
          )}
          <View style={main.toolbarActions}>
            {selectionMode ? (
              <View style={main.selectionActions}>
                <TouchableOpacity activeOpacity={0.86} onPress={exitSelectionMode}>
                  <GlassView
                    glassEffectStyle={GLASS_EFFECT}
                    colorScheme="dark"
                    isInteractive
                    style={[main.glassButton, main.glassIconButton, main.selectionTopButton]}
                  >
                    <Ionicons name="close-outline" size={16} color="#FFFFFF" />
                  </GlassView>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.86} onPress={handleDeleteSelected} disabled={selectedTableIds.size === 0}>
                  <GlassView
                    glassEffectStyle={GLASS_EFFECT}
                    colorScheme="dark"
                    isInteractive
                    style={[main.glassButton, main.glassIconButton, selectedTableIds.size === 0 && main.glassButtonDisabled]}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                  </GlassView>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity activeOpacity={0.86} onPress={() => setSelectionMode(true)}>
                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={[main.glassButton, main.glassSelectButton, main.glassButtonRaised]}
                >
                  <Text style={main.glassSelectText}>Seleziona</Text>
                </GlassView>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {filteredTables.length === 0 ? (
        <View style={main.empty}>
          <View style={main.emptyIcon}><Ionicons name="grid-outline" size={44} color="rgba(255,255,255,0.22)" /></View>
          <Text style={main.emptyTitle}>{t('tablesUi.emptyTitle')}</Text>
          <Text style={main.emptyHint}>
            {isRealFolder(activeFolder)
              ? `${t('tablesUi.emptyHint')} (${activeFolder})`
              : t('tablesUi.emptyHint')}
          </Text>
          <TouchableOpacity style={main.emptyButton} onPress={() => setShowCreate(true)}>
            <Text style={main.emptyButtonText}>{t('tablesUi.createTable')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={main.grid}>
          {filteredTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              cardWidth={cardWidth}
              selected={selectedTableIds.has(table.id)}
              selectionMode={selectionMode}
              onPress={() => handleCardPress(table)}
              onLongPress={() => handleCardLongPress(table)}
            />
          ))}
        </ScrollView>
      )}

      <CreateModal
        visible={showCreate}
        initialTable={editingTable}
        onClose={closeEditor}
        onSubmit={(name, color, cols, rows) => {
          if (editingTable) {
            updateTable(editingTable.id, resizeTablePatch(editingTable, name, color, cols, rows));
            setOpenTable((current) => (current?.id === editingTable.id ? { ...current, ...resizeTablePatch(editingTable, name, color, cols, rows) } : current));
            return;
          }
          addTable(name, color, cols, rows, createTarget.folder);
        }}
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

      {!selectionMode ? (
        <View style={main.fabLayer} pointerEvents="box-none">
          <TouchableOpacity
            style={[indexStyles.fab, main.fab]}
            onPress={() => {
              setEditingTable(null);
              setShowCreate(true);
            }}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.canvas },
  toolbar: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 8 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toolbarSub: { color: C.muted, fontSize: 13, marginTop: 8 },
  toolbarSubPlaceholder: { flex: 1 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectionActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  glassButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  glassIconButton: {
    width: 38,
    minHeight: 38,
    paddingHorizontal: 0,
    borderRadius: 19,
    justifyContent: 'center',
  },
  glassSelectButton: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  glassSelectText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  glassButtonRaised: {
    marginTop: -53,
  },
  selectionTopButton: {
    marginBottom: 2,
  },
  glassButtonDisabled: {
    opacity: 0.4,
  },
  glassButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80, marginTop: -20 },
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
  fab: {
    right: 10,
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
  },
});
