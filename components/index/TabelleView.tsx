import { SKETCH_PLANNER } from '@/constants/sketchPlanner';
import { PADDED_SCREEN_FAB_RIGHT, styles as indexStyles } from '@/components/index/indexStyles';
import { TableTaskCreateOverlay } from '@/components/index/TableTaskCreateOverlay';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHabits } from '@/lib/habits/Provider';
import type { UserTable } from '@/lib/habits/schema';
import { toBcp47 } from '@/lib/i18n/bcp47';
import i18n from '@/lib/i18n/i18n';
import { DOMANI_TOMORROW_KEY, IERI_YESTERDAY_KEY, OGGI_TODAY_KEY, TUTTE_KEY } from '@/lib/index/indexTypes';
import Slider from '@react-native-community/slider';
import { MenuView } from '@react-native-menu/menu';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  cellGreen: '#30D158',
  cellOrange: '#FF9F0A',
  cellRed: '#FF453A',
} as const;

const GRID = {
  rowHeaderWidth: 38,
  colWidth: 74,
  colHeight: 28,
  cellHeight: 28,
  gap: 4,
} as const;

const EDIT_ICON_CENTERING = { transform: [{ translateX: 2 }, { translateY: -2 }] } as const;

const MAX_TABLE_COLUMNS = 10;
const TABLE_OVERVIEW_CARD_HEIGHT = 152;

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

type TableSortMode =
  | 'createdAtDesc'
  | 'createdAtAsc'
  | 'alphabeticalAsc'
  | 'alphabeticalDesc'
  | 'completedDesc'
  | 'completedAsc'
  | 'sizeDesc'
  | 'sizeAsc';

const GLASS_EFFECT = { style: 'regular', animate: true, animationDuration: 0.26 } as const;

type TableCellState = '' | 'green' | 'orange' | 'red';

function isColoredTableCellState(value: unknown): value is Exclude<TableCellState, ''> {
  return value === 'green' || value === 'orange' || value === 'red';
}

function normalizeCellState(value: unknown): TableCellState {
  if (isColoredTableCellState(value)) return value;
  if (value === '' || value == null) return '';
  if (typeof value === 'boolean') return value ? 'green' : '';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (isColoredTableCellState(normalized)) return normalized;
    if (normalized === '1' || normalized === 'true') return 'green';
  }
  return value ? 'green' : '';
}

function getCellBackgroundColor(state: TableCellState): string {
  if (state === 'green') return C.cellGreen;
  if (state === 'orange') return C.cellOrange;
  if (state === 'red') return C.cellRed;
  return C.cellOff;
}

function getBrushButtonColor(state: Exclude<TableCellState, ''>): string {
  if (state === 'green') return C.cellGreen;
  if (state === 'orange') return C.cellOrange;
  return C.cellRed;
}

function normalizeChecked(table: UserTable): TableCellState[][] {
  const rowCount = Array.isArray(table.cells) ? table.cells.length : 0;
  const colCount = Array.isArray(table.headerRows?.[0]) ? table.headerRows[0].length : 0;
  return Array.from({ length: rowCount }, (_, ri) =>
    Array.from({ length: colCount }, (_, ci) => normalizeCellState(table.checked?.[ri]?.[ci] ?? table.cells?.[ri]?.[ci]))
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

function getTableSize(table: UserTable): number {
  const cols = getColumnLabels(table).length;
  const rows = table.cells.length;
  return rows * cols;
}

function getTableCompletedCount(table: UserTable): number {
  return normalizeChecked(table).reduce(
    (sum, row) => sum + row.filter(Boolean).length,
    0
  );
}

function getTableCompletionRatio(table: UserTable): number {
  const total = Math.max(1, getTableSize(table));
  return getTableCompletedCount(table) / total;
}

function getTableCompletionPercentLabel(table: UserTable): string {
  return `${Math.round(getTableCompletionRatio(table) * 100)}%`;
}

function getSortOptions(t: ReturnType<typeof useTranslation>['t']): { mode: TableSortMode; title: string; subtitle?: string }[] {
  return [
    { mode: 'createdAtDesc', title: t('tablesUi.sortCreatedAtDesc'), subtitle: t('tablesUi.sortSubtitleCreatedAt') },
    { mode: 'createdAtAsc', title: t('tablesUi.sortCreatedAtAsc'), subtitle: t('tablesUi.sortSubtitleCreatedAt') },
    { mode: 'alphabeticalAsc', title: t('tablesUi.sortAlphabeticalAsc') },
    { mode: 'alphabeticalDesc', title: t('tablesUi.sortAlphabeticalDesc') },
    { mode: 'completedDesc', title: t('tablesUi.sortCompletedDesc'), subtitle: t('tablesUi.sortSubtitleCompletion') },
    { mode: 'completedAsc', title: t('tablesUi.sortCompletedAsc'), subtitle: t('tablesUi.sortSubtitleCompletion') },
    { mode: 'sizeDesc', title: t('tablesUi.sortSizeDesc'), subtitle: t('tablesUi.sortSubtitleSize') },
    { mode: 'sizeAsc', title: t('tablesUi.sortSizeAsc'), subtitle: t('tablesUi.sortSubtitleSize') },
  ];
}

function resizeTablePatch(table: UserTable, name: string, color: string, cols: number, rows: number): Partial<Omit<UserTable, 'id' | 'createdAt'>> {
  const safeCols = Math.max(1, Math.min(10, Math.floor(cols)));
  const safeRows = Math.max(1, Math.min(20, Math.floor(rows)));
  const currentLabels = getColumnLabels(table);
  const currentChecked = normalizeChecked(table);

  const nextLabels = Array.from({ length: safeCols }, (_, index) => currentLabels[index] ?? '');
  const nextChecked = Array.from({ length: safeRows }, (_, rowIndex) =>
    Array.from({ length: safeCols }, (_, colIndex) => currentChecked[rowIndex]?.[colIndex] ?? '')
  );

  return {
    name,
    color,
    headerRows: [nextLabels],
    headerCols: Array.from({ length: safeRows }, (_, index) => [String(index + 1)]),
    cells: nextChecked.map((row) => row.map((value) => value)),
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
    .map((row) => Array.from({ length: previewColumns }, (_, index) => row[index] ?? ''));
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
          {row.map((cellState, ci) => (
            <View
              key={ci}
              style={[
                thumbnail.fillCell,
                { width: dataCellWidth, height: indexCellSize, backgroundColor: getCellBackgroundColor(cellState) },
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

function SortDecreasingLinesIcon() {
  return (
    <View style={sortGlyph.root}>
      <View style={[sortGlyph.line, sortGlyph.top]} />
      <View style={[sortGlyph.line, sortGlyph.middle]} />
      <View style={[sortGlyph.line, sortGlyph.bottom]} />
    </View>
  );
}

function FloatingGlassSymbol({
  name,
  size = 26,
}: {
  name: 'plus' | 'minus' | 'xmark';
  size?: number;
}) {
  return (
    <IconSymbol
      name={name}
      size={size}
      color={C.text}
      weight="medium"
      style={sheet.floatingNativeSymbol}
    />
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
  const completionPercent = getTableCompletionPercentLabel(table);
  return (
    <View style={[cards.cardWrap, { width: cardWidth }, selected && cards.cardWrapSelected]}>
      {selected ? <View pointerEvents="none" style={cards.selectionOutline} /> : null}
      <TouchableOpacity
        style={[
          cards.card,
          { borderTopColor: table.color },
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
          <View style={cards.metaRow}>
            <Text style={cards.meta} numberOfLines={1}>{rows}-{cols}</Text>
            <Text style={[cards.meta, cards.completionMeta]} numberOfLines={1}>{completionPercent}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
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
  cardWrap: {
    position: 'relative',
    overflow: 'visible',
  },
  cardWrapSelected: {
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderTopWidth: 4,
    overflow: 'hidden',
    height: TABLE_OVERVIEW_CARD_HEIGHT,
  },
  cardSelected: {
  },
  selectionOutline: {
    position: 'absolute',
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 1,
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
    flex: 1,
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
  completionMeta: {
    color: C.cellGreen,
    fontFamily: 'BagelFatOne_400Regular',
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
});

const sortGlyph = StyleSheet.create({
  root: {
    width: 15,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.65,
  },
  line: {
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  top: {
    width: 14,
  },
  middle: {
    width: 11.5,
  },
  bottom: {
    width: 8.5,
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
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const columnLabels = useMemo(() => getColumnLabels(table), [table]);
  const [labels, setLabels] = useState(columnLabels);
  const [checked, setChecked] = useState(() => normalizeChecked(table));
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [taskModalTitle, setTaskModalTitle] = useState<string | null>(null);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [activeBrushColor, setActiveBrushColor] = useState<Exclude<TableCellState, ''>>('green');
  const actionsProgress = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    setActionsExpanded(false);
    actionsProgress.setValue(0);
  }, [actionsProgress, table.id]);

  const persist = useCallback((nextLabels: string[], nextChecked: TableCellState[][]) => {
    onUpdate({
      headerRows: [nextLabels],
      cells: nextChecked.map((row) => row.map((value) => value)),
      checked: nextChecked,
    });
  }, [onUpdate]);

  const toggleCell = useCallback((rowIndex: number, colIndex: number) => {
    const next = checked.map((row) => [...row]);
    next[rowIndex][colIndex] = next[rowIndex][colIndex] === activeBrushColor ? '' : activeBrushColor;
    setChecked(next);
    persist(labels, next);
  }, [activeBrushColor, checked, labels, persist]);

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
    const nextChecked = [...checked, Array(labels.length).fill('') as TableCellState[]];
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
    const nextChecked = checked.map((row) => [...row, ''] as TableCellState[]);
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
      t('tablesUi.infoTitle'),
      t('tablesUi.infoBody')
    );
  }, [t]);

  const setMenuExpanded = useCallback((nextExpanded: boolean) => {
    setActionsExpanded(nextExpanded);
    Animated.spring(actionsProgress, {
      toValue: nextExpanded ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      mass: 0.9,
      stiffness: 210,
    }).start();
  }, [actionsProgress]);

  const toggleMenu = useCallback(() => {
    setMenuExpanded(!actionsExpanded);
  }, [actionsExpanded, setMenuExpanded]);

  const closeMenu = useCallback(() => {
    setMenuExpanded(false);
  }, [setMenuExpanded]);

  const cycleBrushColor = useCallback(() => {
    setActiveBrushColor((current) => {
      if (current === 'green') return 'orange';
      if (current === 'orange') return 'red';
      return 'green';
    });
  }, []);

  const rowAddStyle = useMemo(() => ({
    opacity: actionsProgress,
    transform: [
      {
        translateY: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [132, 0],
        }),
      },
      {
        scale: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.72, 1],
        }),
      },
    ],
  }), [actionsProgress]);

  const rowRemoveStyle = useMemo(() => ({
    opacity: actionsProgress,
    transform: [
      {
        translateY: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [66, 0],
        }),
      },
      {
        scale: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 1],
        }),
      },
    ],
  }), [actionsProgress]);

  const colAddStyle = useMemo(() => ({
    opacity: actionsProgress,
    transform: [
      {
        translateX: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [132, 0],
        }),
      },
      {
        scale: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.72, 1],
        }),
      },
    ],
  }), [actionsProgress]);

  const colRemoveStyle = useMemo(() => ({
    opacity: actionsProgress,
    transform: [
      {
        translateX: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [66, 0],
        }),
      },
      {
        scale: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 1],
        }),
      },
    ],
  }), [actionsProgress]);

  const brushStyle = useMemo(() => ({
    opacity: actionsProgress,
    transform: [
      {
        translateX: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [78, 0],
        }),
      },
      {
        translateY: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [78, 0],
        }),
      },
      {
        scale: actionsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.74, 1],
        }),
      },
    ],
  }), [actionsProgress]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={sheet.container}>
        <View style={sheet.topBar}>
          <TouchableOpacity style={sheet.backButton} onPress={onClose}>
            <Ionicons name="chevron-back" size={22} color={table.color} />
            <Text style={[sheet.backText, { color: table.color }]}>{t('tablesUi.back')}</Text>
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
                  {row.map((cellState, colIndex) => (
                    <Pressable
                      key={`cell-${rowIndex}-${colIndex}`}
                      style={[
                        sheet.cell,
                        { width: columnWidth, height: cellSize, backgroundColor: getCellBackgroundColor(cellState) },
                      ]}
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
            { right: 20, bottom: 60 },
          ]}
        >
          <View style={sheet.floatingActions}>
            <View style={sheet.rowActions}>
              <Animated.View style={[sheet.floatingAnimatedButton, rowAddStyle]} pointerEvents={actionsExpanded ? 'auto' : 'none'}>
                <TouchableOpacity
                  style={sheet.floatingTouch}
                  onPress={removeRow}
                  disabled={checked.length <= 1}
                  activeOpacity={0.9}
                >
                  <GlassView
                    glassEffectStyle={GLASS_EFFECT}
                    colorScheme="dark"
                    isInteractive
                    style={[
                      sheet.floatingButton,
                      checked.length <= 1 && sheet.floatingButtonDisabled,
                    ]}
                  >
                    <View style={sheet.floatingButtonContent}>
                      <View style={sheet.floatingButtonSymbolWrap}>
                        <FloatingGlassSymbol name="minus" />
                      </View>
                    </View>
                  </GlassView>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View style={[sheet.floatingAnimatedButton, rowRemoveStyle]} pointerEvents={actionsExpanded ? 'auto' : 'none'}>
                <TouchableOpacity style={sheet.floatingTouch} onPress={addRow} activeOpacity={0.9}>
                  <GlassView
                    glassEffectStyle={GLASS_EFFECT}
                    colorScheme="dark"
                    isInteractive
                    style={sheet.floatingButton}
                  >
                    <View style={sheet.floatingButtonContent}>
                      <View style={sheet.floatingButtonSymbolWrap}>
                        <FloatingGlassSymbol name="plus" />
                      </View>
                    </View>
                  </GlassView>
                </TouchableOpacity>
              </Animated.View>
            </View>
            <View style={sheet.columnActions}>
              <Animated.View style={[sheet.floatingAnimatedButton, colAddStyle]} pointerEvents={actionsExpanded ? 'auto' : 'none'}>
                <TouchableOpacity
                  style={sheet.floatingTouch}
                  onPress={removeColumn}
                  disabled={labels.length <= 1}
                  activeOpacity={0.9}
                >
                  <GlassView
                    glassEffectStyle={GLASS_EFFECT}
                    colorScheme="dark"
                    isInteractive
                    style={[
                      sheet.floatingButton,
                      labels.length <= 1 && sheet.floatingButtonDisabled,
                    ]}
                  >
                    <View style={sheet.floatingButtonContent}>
                      <View style={sheet.floatingButtonSymbolWrap}>
                        <FloatingGlassSymbol name="minus" />
                      </View>
                    </View>
                  </GlassView>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View style={[sheet.floatingAnimatedButton, colRemoveStyle]} pointerEvents={actionsExpanded ? 'auto' : 'none'}>
                <TouchableOpacity
                  style={sheet.floatingTouch}
                  onPress={addColumn}
                  disabled={labels.length >= 10}
                  activeOpacity={0.9}
                >
                  <GlassView
                    glassEffectStyle={GLASS_EFFECT}
                    colorScheme="dark"
                    isInteractive
                    style={[
                      sheet.floatingButton,
                      labels.length >= 10 && sheet.floatingButtonDisabled,
                    ]}
                  >
                    <View style={sheet.floatingButtonContent}>
                      <View style={sheet.floatingButtonSymbolWrap}>
                        <FloatingGlassSymbol name="plus" />
                      </View>
                    </View>
                  </GlassView>
                </TouchableOpacity>
              </Animated.View>
            </View>
            <Animated.View style={[sheet.brushAction, brushStyle]} pointerEvents={actionsExpanded ? 'auto' : 'none'}>
              <TouchableOpacity
                style={sheet.floatingTouch}
                onPress={cycleBrushColor}
                activeOpacity={0.9}
              >
                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={[
                    sheet.floatingButton,
                    { backgroundColor: getBrushButtonColor(activeBrushColor) },
                  ]}
                >
                  <View style={sheet.floatingButtonContent}>
                    <View style={sheet.floatingButtonSymbolWrap}>
                      <MaterialCommunityIcons name="brush" size={28} color={C.text} />
                    </View>
                  </View>
                </GlassView>
              </TouchableOpacity>
            </Animated.View>
            <TouchableOpacity
              style={sheet.floatingAnchorTouch}
              onPress={actionsExpanded ? closeMenu : toggleMenu}
              activeOpacity={0.9}
            >
              <GlassView
                glassEffectStyle={GLASS_EFFECT}
                colorScheme="dark"
                isInteractive
                style={sheet.floatingButton}
              >
                <View style={sheet.floatingButtonContent}>
                  <View style={sheet.floatingButtonSymbolWrap}>
                    {actionsExpanded ? (
                      <FloatingGlassSymbol name="xmark" />
                    ) : (
                      <Ionicons name="create-outline" size={28} color={C.text} style={EDIT_ICON_CENTERING} />
                    )}
                  </View>
                </View>
              </GlassView>
            </TouchableOpacity>
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
  floatingActionsWrap: {
    position: 'absolute',
  },
  floatingActions: {
    width: 232,
    height: 190,
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
    right: 66,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
  },
  brushAction: {
    position: 'absolute',
    right: 68,
    bottom: 68,
  },
  floatingButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  floatingTouch: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  floatingAnchorTouch: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  floatingAnimatedButton: {
    width: 58,
    height: 58,
  },
  floatingButtonContent: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  floatingButtonSymbolWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingNativeSymbol: {
    opacity: 0.96,
  },
  floatingButtonDisabled: {
    opacity: 0.32,
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
  const titleScale = Math.min(1.1, Math.max(1, screenWidth / 393));
  const toolbarMarginTop = titleScale < 1.07 ? -20 : -19;
  const [showCreate, setShowCreate] = useState(false);
  const [editingTable, setEditingTable] = useState<UserTable | null>(null);
  const [openTable, setOpenTable] = useState<UserTable | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<TableSortMode>('createdAtDesc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(screenWidth);
  const selectionControlProgress = React.useRef(new Animated.Value(0)).current;
  const sortOptions = useMemo(() => getSortOptions(t), [t]);
  const sortLocale = toBcp47(i18n.language);

  const createTarget = useMemo(
    () => getCreateTarget(activeFolder, todayYmd, tomorrowYmd, yesterdayYmd),
    [activeFolder, todayYmd, tomorrowYmd, yesterdayYmd]
  );
  const filteredTables = useMemo(() => {
    if (!isRealFolder(activeFolder)) return tables;
    const normalizedFolder = activeFolder.trim();
    return tables.filter((table) => (table.folder ?? '').trim() === normalizedFolder);
  }, [activeFolder, tables]);
  const sortedTables = useMemo(() => {
    const next = [...filteredTables];
    next.sort((a, b) => {
      if (sortMode === 'alphabeticalAsc') {
        return a.name.localeCompare(b.name, sortLocale, { sensitivity: 'base' }) || b.id.localeCompare(a.id);
      }
      if (sortMode === 'alphabeticalDesc') {
        return b.name.localeCompare(a.name, sortLocale, { sensitivity: 'base' }) || b.id.localeCompare(a.id);
      }
      if (sortMode === 'completedDesc') {
        return getTableCompletionRatio(b) - getTableCompletionRatio(a)
          || getTableCompletedCount(b) - getTableCompletedCount(a)
          || b.name.localeCompare(a.name, sortLocale, { sensitivity: 'base' })
          || b.id.localeCompare(a.id);
      }
      if (sortMode === 'completedAsc') {
        return getTableCompletionRatio(a) - getTableCompletionRatio(b)
          || getTableCompletedCount(a) - getTableCompletedCount(b)
          || a.name.localeCompare(b.name, sortLocale, { sensitivity: 'base' })
          || b.id.localeCompare(a.id);
      }
      if (sortMode === 'sizeDesc') {
        return getTableSize(b) - getTableSize(a)
          || b.name.localeCompare(a.name, sortLocale, { sensitivity: 'base' })
          || b.id.localeCompare(a.id);
      }
      if (sortMode === 'sizeAsc') {
        return getTableSize(a) - getTableSize(b)
          || a.name.localeCompare(b.name, sortLocale, { sensitivity: 'base' })
          || b.id.localeCompare(a.id);
      }
      if (sortMode === 'createdAtAsc') {
        return (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);
      }
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id);
    });
    return next;
  }, [filteredTables, sortLocale, sortMode]);
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
      idsToDelete.length === 1
        ? t('tablesUi.deleteSelectedOne')
        : t('tablesUi.deleteSelectedMany', { count: idsToDelete.length }),
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

  useEffect(() => {
    Animated.timing(selectionControlProgress, {
      toValue: selectionMode ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [selectionControlProgress, selectionMode]);

  const selectionControlWidth = selectionControlProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [92, 32],
  });
  const selectionLabelOpacity = selectionControlProgress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 0.15, 0],
  });
  const selectionLabelTranslate = selectionControlProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const selectionIconOpacity = selectionControlProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0.25, 1],
  });
  const selectionIconScale = selectionControlProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });

  return (
    <View style={main.container} onLayout={handleContainerLayout}>
      <View style={[main.toolbar, { marginTop: toolbarMarginTop }]}>
        <View style={main.toolbarRow}>
          {selectionMode ? (
            <Text style={main.toolbarSub}>
              {selectedTableIds.size > 0
                ? selectedTableIds.size === 1
                  ? t('tablesUi.selectionCountOne')
                  : t('tablesUi.selectionCountMany', { count: selectedTableIds.size })
                : t('tablesUi.selectionEmpty')}
            </Text>
          ) : (
            <View style={main.toolbarSubPlaceholder} />
          )}
          <View style={main.toolbarActions}>
            <MenuView
              style={main.sortMenuHost}
              shouldOpenOnLongPress={false}
              onOpenMenu={() => setSortMenuOpen(true)}
              onCloseMenu={() => setSortMenuOpen(false)}
              onPressAction={({ nativeEvent }) => {
                const nextSortMode = nativeEvent.event as TableSortMode;
                if (sortOptions.some((option) => option.mode === nextSortMode)) {
                  setSortMode(nextSortMode);
                }
              }}
              actions={sortOptions.map((option) => ({
                id: option.mode,
                title: option.title,
                subtitle: option.subtitle,
                state: sortMode === option.mode ? 'on' : 'off',
              }))}
            >
              <View style={[main.sortMenuTrigger, sortMenuOpen && main.sortMenuTriggerHidden]}>
                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  style={[main.glassButton, main.glassSortButton]}
                >
                  <SortDecreasingLinesIcon />
                </GlassView>
              </View>
            </MenuView>
            <Animated.View style={[main.selectionControlWrap, { width: selectionControlWidth }]}>
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => {
                  if (selectionMode) exitSelectionMode();
                  else setSelectionMode(true);
                }}
                style={main.selectionControlTouch}
              >
                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={[main.glassButton, main.glassSelectButton, main.glassButtonRaised, selectionMode && main.closeButtonRaised, main.selectionMorphButton]}
                >
                  <Animated.Text
                    style={[
                      main.glassSelectText,
                      main.selectionLabel,
                      {
                        opacity: selectionLabelOpacity,
                        transform: [{ translateX: selectionLabelTranslate }],
                      },
                    ]}
                  >
                    {t('tablesUi.select')}
                  </Animated.Text>
                  <Animated.View
                    style={[
                      main.selectionCloseIcon,
                      {
                        opacity: selectionIconOpacity,
                        transform: [{ scale: selectionIconScale }],
                      },
                    ]}
                  >
                    <Ionicons name="close-outline" size={16} color="rgba(255,255,255,0.72)" />
                  </Animated.View>
                </GlassView>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </View>

      {sortedTables.length === 0 ? (
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
          {sortedTables.map((table) => (
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

      <View style={main.fabLayer} pointerEvents="box-none">
        {selectionMode ? (
          <TouchableOpacity
            style={main.fabGlassTouch}
            onPress={handleDeleteSelected}
            disabled={selectedTableIds.size === 0}
            activeOpacity={0.9}
          >
            <GlassView
              glassEffectStyle={GLASS_EFFECT}
              colorScheme="dark"
              isInteractive
              style={[
                indexStyles.fab,
                main.fab,
                main.fabGlass,
                selectedTableIds.size > 0 && main.fabGlassActive,
                selectedTableIds.size === 0 && main.fabGlassDisabled,
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={24}
                color={selectedTableIds.size > 0 ? '#FF3B30' : '#FFFFFF'}
              />
            </GlassView>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[indexStyles.fab, main.fab]}
            onPress={() => {
              setEditingTable(null);
              setShowCreate(true);
            }}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.canvas },
  toolbar: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 8, marginBottom: -25 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toolbarSub: { color: C.muted, fontSize: 13, marginTop: 8 },
  toolbarSubPlaceholder: { flex: 1 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortMenuHost: {
    width: 32,
    height: 32,
    marginTop: -64,
    zIndex: 12,
  },
  sortMenuTrigger: {
    overflow: 'visible',
  },
  sortMenuTriggerHidden: {
    opacity: 0,
  },
  selectionControlWrap: {
    minHeight: 32,
    overflow: 'visible',
  },
  selectionControlTouch: {
    width: '100%',
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
  glassSortButton: {
    width: 32,
    minHeight: 32,
    height: 32,
    paddingHorizontal: 0,
    borderRadius: 16,
    justifyContent: 'center',
  },
  glassSelectButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  glassSelectText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '600',
  },
  selectionMorphButton: {
    width: '100%',
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  selectionLabel: {
    position: 'absolute',
    alignSelf: 'center',
  },
  selectionCloseIcon: {
    position: 'absolute',
    alignSelf: 'center',
  },
  glassButtonRaised: {
    marginTop: -32,
  },
  sortButtonRaised: {
    marginTop: -48,
  },
  closeButtonRaised: {
    marginTop: -32,
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
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 120, paddingTop: 0, alignContent: 'flex-start' },
  fabLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fab: {
    right: PADDED_SCREEN_FAB_RIGHT,
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
  },
  fabGlassTouch: {
    position: 'absolute',
    right: PADDED_SCREEN_FAB_RIGHT,
    bottom: 0,
    borderRadius: 999,
  },
  fabGlass: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  fabGlassActive: {
    backgroundColor: 'rgba(255,59,48,0.28)',
    borderColor: 'rgba(255,99,92,0.5)',
    shadowColor: '#ff3b30',
    shadowOpacity: 0.3,
  },
  fabGlassDisabled: {
    opacity: 0.42,
  },
  fabDisabled: {
    opacity: 0.45,
  },
});
