import { SKETCH_PLANNER } from '@/constants/sketchPlanner';
import { Kalam_400Regular, Kalam_700Bold, useFonts } from '@expo-google-fonts/kalam';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export { SKETCH_PLANNER } from '@/constants/sketchPlanner';

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function parseCellKey(key: string): { row: number; col: number } | null {
  const m = /^(\d+):(\d+)$/.exec(key.trim());
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

export type SketchPlannerGridProps = {
  columnTitles: string[];
  rowCount: number;
  /** Defaults to "1" … rowCount */
  rowLabels?: string[];
  /** Body cell keys "row:col" (0-based). Passing this makes selection controlled. */
  selectedKeys?: string[];
  /** Uncontrolled initial selection */
  defaultSelectedKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
  selectionMode?: 'single' | 'multiple';
  labelColumnWidth?: number;
  headerRowHeight?: number;
  cellMinWidth?: number;
  rowHeight?: number;
  highlightColor?: string;
  /** Inset of lime fill inside cell so white grid stays visible */
  selectionInset?: number;
  selectionRadius?: number;
  hapticsOnSelect?: boolean;
  style?: StyleProp<ViewStyle>;
};

function normalizeKeys(keys: string[] | undefined): Set<string> {
  return new Set(keys ?? []);
}

const SketchGridCanvas = React.memo(function SketchGridCanvas({
  width,
  height,
  labelW,
  headerH,
  cellW,
  cellH,
  cols,
  rows,
}: {
  width: number;
  height: number;
  labelW: number;
  headerH: number;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
}) {
  const { gridPath, nodePath } = useMemo(() => {
    const xs: number[] = [];
    for (let i = 0; i <= cols; i++) xs.push(labelW + i * cellW);
    xs.unshift(0);

    const ys: number[] = [];
    for (let j = 0; j <= rows; j++) ys.push(headerH + j * cellH);
    ys.unshift(0);

    const grid = Skia.Path.Make();
    for (const x of xs) {
      grid.moveTo(x, 0);
      grid.lineTo(x, height);
    }
    for (const y of ys) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
    }

    const nodes = Skia.Path.Make();
    const arm = SKETCH_PLANNER.nodeArm;
    for (const x of xs) {
      for (const y of ys) {
        nodes.moveTo(x - arm, y);
        nodes.lineTo(x + arm, y);
        nodes.moveTo(x, y - arm);
        nodes.lineTo(x, y + arm);
      }
    }

    return { gridPath: grid, nodePath: nodes };
  }, [width, height, labelW, headerH, cellW, cellH, cols, rows]);

  if (width <= 0 || height <= 0) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path
        path={gridPath}
        style="stroke"
        strokeWidth={SKETCH_PLANNER.gridStroke}
        color={SKETCH_PLANNER.gridLine}
      />
      <Path
        path={nodePath}
        style="stroke"
        strokeWidth={SKETCH_PLANNER.nodeStroke}
        color={SKETCH_PLANNER.gridLine}
        strokeCap="round"
      />
    </Canvas>
  );
});

export function SketchPlannerGrid({
  columnTitles,
  rowCount,
  rowLabels: rowLabelsProp,
  selectedKeys: selectedKeysControlled,
  defaultSelectedKeys,
  onSelectedKeysChange,
  selectionMode = 'multiple',
  labelColumnWidth = 44,
  headerRowHeight = 46,
  cellMinWidth = 52,
  rowHeight = 48,
  highlightColor = SKETCH_PLANNER.highlight,
  selectionInset = 3,
  selectionRadius = 6,
  hapticsOnSelect = true,
  style,
}: SketchPlannerGridProps) {
  const [fontsLoaded] = useFonts({
    Kalam_400Regular,
    Kalam_700Bold,
  });

  const cols = columnTitles.length;
  const rows = rowCount;
  const rowLabels = useMemo(() => {
    if (rowLabelsProp && rowLabelsProp.length === rows) return rowLabelsProp;
    return Array.from({ length: rows }, (_, i) => String(i + 1));
  }, [rowLabelsProp, rows]);

  const isControlled = selectedKeysControlled !== undefined;
  const [internalSel, setInternalSel] = useState<Set<string>>(
    () => normalizeKeys(defaultSelectedKeys),
  );

  const selectedSet = isControlled
    ? normalizeKeys(selectedKeysControlled)
    : internalSel;

  const setSelection = useCallback(
    (next: Set<string>) => {
      const arr = [...next];
      if (!isControlled) setInternalSel(next);
      onSelectedKeysChange?.(arr);
    },
    [isControlled, onSelectedKeysChange],
  );

  const onBodyPress = useCallback(
    (row: number, col: number) => {
      const key = cellKey(row, col);
      const next = new Set(selectedSet);
      if (selectionMode === 'single') {
        if (next.has(key) && next.size === 1) next.clear();
        else {
          next.clear();
          next.add(key);
        }
      } else if (next.has(key)) next.delete(key);
      else next.add(key);

      if (hapticsOnSelect && Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setSelection(next);
    },
    [hapticsOnSelect, selectedSet, selectionMode, setSelection],
  );

  const [measuredW, setMeasuredW] = useState(0);
  const innerW = Math.max(0, measuredW - labelColumnWidth);
  const cellW =
    cols > 0 ? Math.max(cellMinWidth, innerW > 0 ? innerW / cols : cellMinWidth) : cellMinWidth;
  const totalW = labelColumnWidth + cols * cellW;
  const totalH = headerRowHeight + rows * rowHeight;
  const needsHorizontalScroll = measuredW > 0 && totalW > measuredW + 0.5;

  const labelFont = fontsLoaded ? 'Kalam_700Bold' : undefined;
  const bodyLabelFont = fontsLoaded ? 'Kalam_400Regular' : undefined;

  if (!fontsLoaded) {
    return (
      <View style={[styles.loaderWrap, style]}>
        <ActivityIndicator color={SKETCH_PLANNER.highlight} />
      </View>
    );
  }

  const gridInner = (
    <View style={[styles.gridFrame, { width: totalW, height: totalH, backgroundColor: SKETCH_PLANNER.background }]}>
      {Array.from(selectedSet).map((key) => {
        const pos = parseCellKey(key);
        if (!pos || pos.row < 0 || pos.row >= rows || pos.col < 0 || pos.col >= cols) return null;
        const left = labelColumnWidth + pos.col * cellW + selectionInset;
        const top = headerRowHeight + pos.row * rowHeight + selectionInset;
        const w = cellW - selectionInset * 2;
        const h = rowHeight - selectionInset * 2;
        return (
          <View
            key={key}
            pointerEvents="none"
            style={[
              styles.selectionBlock,
              {
                left,
                top,
                width: w,
                height: h,
                borderRadius: selectionRadius,
                backgroundColor: highlightColor,
              },
            ]}
          />
        );
      })}

      <SketchGridCanvas
        width={totalW}
        height={totalH}
        labelW={labelColumnWidth}
        headerH={headerRowHeight}
        cellW={cellW}
        cellH={rowHeight}
        cols={cols}
        rows={rows}
      />

      <View style={[styles.interactionLayer, { width: totalW, height: totalH }]} pointerEvents="box-none">
        <View style={[styles.row, { height: headerRowHeight }]}>
          <View style={{ width: labelColumnWidth }} />
          {columnTitles.map((title, ci) => (
            <View key={ci} style={[styles.headerCell, { width: cellW }]}>
              <Text style={[styles.colTitle, labelFont && { fontFamily: labelFont }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
          ))}
        </View>

        {Array.from({ length: rows }).map((_, ri) => (
          <View key={ri} style={[styles.row, { height: rowHeight }]}>
            <View style={[styles.rowLabelCell, { width: labelColumnWidth }]}>
              <Text
                style={[styles.rowTitle, bodyLabelFont && { fontFamily: bodyLabelFont }]}
                numberOfLines={1}
              >
                {rowLabels[ri] ?? String(ri + 1)}
              </Text>
            </View>
            {Array.from({ length: cols }).map((_, ci) => (
              <Pressable
                key={ci}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedSet.has(cellKey(ri, ci)) }}
                onPress={() => onBodyPress(ri, ci)}
                style={({ pressed }) => [
                  styles.bodyHit,
                  { width: cellW, height: rowHeight },
                  pressed && styles.bodyHitPressed,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View
      style={[styles.root, { width: '100%', minHeight: totalH }, style]}
      onLayout={(e) => setMeasuredW(e.nativeEvent.layout.width)}
    >
      {needsHorizontalScroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.hScrollContent}
        >
          {gridInner}
        </ScrollView>
      ) : (
        <View style={styles.centerGrid}>{gridInner}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'stretch',
  },
  hScrollContent: {},
  centerGrid: {
    alignSelf: 'center',
  },
  loaderWrap: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SKETCH_PLANNER.background,
  },
  gridFrame: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  selectionBlock: {
    position: 'absolute',
  },
  interactionLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  headerCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  rowLabelCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  colTitle: {
    color: SKETCH_PLANNER.label,
    fontSize: 17,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  rowTitle: {
    color: SKETCH_PLANNER.label,
    fontSize: 18,
    textAlign: 'center',
  },
  bodyHit: {
    backgroundColor: 'transparent',
  },
  bodyHitPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});
