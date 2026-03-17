import { useHabits } from '@/lib/habits/Provider';
import type { UserTable } from '@/lib/habits/schema';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  canvas:      '#1C1C1E',
  headerBg:    '#2C2C2E',
  cellBg:      '#1C1C1E',
  cellAlt:     '#242426',
  gridLine:    '#38383A',
  accent:      '#0A84FF',
  textPrimary: '#FFFFFF',
  textMuted:   '#8E8E93',
  textHeader:  '#EBEBF5',
  surface:     '#2C2C2E',
};

const COL_W  = 100;
const ROW_H  = 44;
const HDR_W  = 44;   // row-header column width
const HDR_H  = 44;   // column-header row height

// ─── Sequence auto-detection ──────────────────────────────────────────────────
function detectNext(vals: string[]): string {
  const nonEmpty = vals.filter(v => v.trim() !== '');
  if (nonEmpty.length === 0) return '';

  // All numeric
  const nums = nonEmpty.map(Number);
  if (nonEmpty.every((v, i) => !isNaN(nums[i]) && v !== '')) {
    if (nonEmpty.length === 1) return String(nums[0] + 1);
    const diff = nums[nums.length - 1] - nums[nums.length - 2];
    return String(nums[nums.length - 1] + diff);
  }

  // Single letter
  if (nonEmpty.every(v => /^[A-Za-z]$/.test(v))) {
    const code = nonEmpty[nonEmpty.length - 1].toUpperCase().charCodeAt(0);
    return String.fromCharCode(code + 1);
  }

  // Prefix + number (e.g. "Giorno 1", "Q3")
  const last = nonEmpty[nonEmpty.length - 1];
  const m = last.match(/^(.*?)(\d+)(\D*)$/);
  if (m) {
    const nextNum = nonEmpty.length >= 2
      ? (() => {
          const prev = nonEmpty[nonEmpty.length - 2].match(/^(.*?)(\d+)(\D*)$/);
          if (prev && prev[1] === m[1] && prev[3] === m[3]) {
            return parseInt(m[2]) + (parseInt(m[2]) - parseInt(prev[2]));
          }
          return parseInt(m[2]) + 1;
        })()
      : parseInt(m[2]) + 1;
    return `${m[1]}${nextNum}${m[3]}`;
  }

  return '';
}

// ─── Table thumbnail (home grid) ──────────────────────────────────────────────
function TableThumbnail({ table, accent }: { table: UserTable; accent: string }) {
  const cols = Math.min(table.headerRows[0]?.length ?? 0, 4);
  const rows = Math.min(table.headerCols.length, 3);
  const cw = cols > 0 ? Math.floor(88 / (cols + 0.5)) : 22;
  const ch = 10;
  return (
    <View style={{ gap: 1 }}>
      {/* header row */}
      <View style={{ flexDirection: 'row', gap: 1 }}>
        <View style={{ width: cw / 2, height: ch, backgroundColor: accent + '88', borderRadius: 1 }} />
        {Array.from({ length: cols }).map((_, i) => (
          <View key={i} style={{ width: cw, height: ch, backgroundColor: accent, borderRadius: 1 }} />
        ))}
      </View>
      {/* body rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 1 }}>
          <View style={{ width: cw / 2, height: ch, backgroundColor: accent + '55', borderRadius: 1 }} />
          {Array.from({ length: cols }).map((_, ci) => {
            const val = table.cells[ri]?.[ci];
            return (
              <View key={ci} style={{ width: cw, height: ch, backgroundColor: ri % 2 === 0 ? '#3A3A3C' : '#2C2C2E', borderRadius: 1, justifyContent: 'center', alignItems: 'center' }}>
                {val ? <View style={{ width: '55%', height: 3, backgroundColor: '#FFFFFF30', borderRadius: 1 }} /> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Home card ────────────────────────────────────────────────────────────────
const CARD_W = (SCREEN_W - 32 - 12) / 2;

function TableCard({ table, onPress, onLongPress }: { table: UserTable; onPress: () => void; onLongPress: () => void }) {
  const accent = table.color;
  return (
    <TouchableOpacity
      style={[dc.card, { borderTopColor: accent }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={0.75}
    >
      <View style={dc.preview}>
        <TableThumbnail table={table} accent={accent} />
      </View>
      <Text style={dc.name} numberOfLines={2}>{table.name}</Text>
      <Text style={dc.meta}>{table.headerCols.length} rig · {table.headerRows[0]?.length ?? 0} col</Text>
    </TouchableOpacity>
  );
}
const dc = StyleSheet.create({
  card:    { width: CARD_W, backgroundColor: '#2C2C2E', borderRadius: 12, overflow: 'hidden', borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  preview: { backgroundColor: '#1C1C1E', padding: 12, alignItems: 'center', justifyContent: 'center', minHeight: 88 },
  name:    { color: '#FFF', fontSize: 13, fontWeight: '600', paddingHorizontal: 10, paddingTop: 8 },
  meta:    { color: '#8E8E93', fontSize: 11, paddingHorizontal: 10, paddingBottom: 10, marginTop: 2 },
});

// ─── Create modal ─────────────────────────────────────────────────────────────
const ACCENT_COLORS = ['#0A84FF','#30D158','#FF9F0A','#FF375F','#BF5AF2','#5E5CE6','#64D2FF','#FF6961'];

function CreateModal({ visible, onClose, onCreate }: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string, cols: number, rows: number) => void;
}) {
  const [name, setName]   = useState('');
  const [cols, setCols]   = useState(4);
  const [rows, setRows]   = useState(5);
  const [accent, setAccent] = useState(ACCENT_COLORS[0]);

  const reset = () => { setName(''); setCols(4); setRows(5); setAccent(ACCENT_COLORS[0]); };
  const close = () => { reset(); onClose(); };
  const canCreate = name.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            <View style={cm.handle} />
            <View style={cm.hdr}>
              <TouchableOpacity onPress={close}><Text style={cm.cancel}>Annulla</Text></TouchableOpacity>
              <Text style={cm.title}>Nuova tabella</Text>
              <TouchableOpacity disabled={!canCreate} onPress={() => { if (canCreate) { onCreate(name.trim(), accent, cols, rows); reset(); onClose(); } }}>
                <Text style={[cm.done, !canCreate && { opacity: 0.3 }]}>Crea</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
              <Text style={cm.label}>NOME</Text>
              <TextInput style={cm.input} value={name} onChangeText={setName} placeholder="Es. Budget mensile" placeholderTextColor={C.textMuted} maxLength={60} autoFocus />

              <Text style={cm.label}>COLORE</Text>
              <View style={cm.colors}>
                {ACCENT_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setAccent(c)}>
                    <View style={[cm.swatch, { backgroundColor: c }, accent === c && cm.swatchSel]} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={cm.label}>DIMENSIONE</Text>
              <View style={cm.sizeRow}>
                <View style={cm.sizeItem}>
                  <Text style={cm.sizeLabel}>Colonne</Text>
                  <View style={cm.sizeStepper}>
                    <TouchableOpacity onPress={() => setCols(c => Math.max(1, c - 1))} style={cm.stepBtn}><Text style={cm.stepTxt}>−</Text></TouchableOpacity>
                    <Text style={cm.sizeVal}>{cols}</Text>
                    <TouchableOpacity onPress={() => setCols(c => Math.min(26, c + 1))} style={cm.stepBtn}><Text style={cm.stepTxt}>+</Text></TouchableOpacity>
                  </View>
                </View>
                <View style={cm.sizeItem}>
                  <Text style={cm.sizeLabel}>Righe</Text>
                  <View style={cm.sizeStepper}>
                    <TouchableOpacity onPress={() => setRows(r => Math.max(1, r - 1))} style={cm.stepBtn}><Text style={cm.stepTxt}>−</Text></TouchableOpacity>
                    <Text style={cm.sizeVal}>{rows}</Text>
                    <TouchableOpacity onPress={() => setRows(r => Math.min(100, r + 1))} style={cm.stepBtn}><Text style={cm.stepTxt}>+</Text></TouchableOpacity>
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
const cm = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8, maxHeight: '85%' },
  handle:     { width: 36, height: 5, borderRadius: 3, backgroundColor: '#48484A', alignSelf: 'center', marginBottom: 8 },
  hdr:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  title:      { color: '#FFF', fontSize: 17, fontWeight: '600' },
  cancel:     { color: C.textMuted, fontSize: 17 },
  done:       { color: C.accent, fontSize: 17, fontWeight: '600' },
  label:      { color: C.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  input:      { backgroundColor: '#2C2C2E', color: '#FFF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#48484A' },
  colors:     { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  swatch:     { width: 32, height: 32, borderRadius: 16 },
  swatchSel:  { borderWidth: 2.5, borderColor: '#fff' },
  sizeRow:    { flexDirection: 'row', gap: 12 },
  sizeItem:   { flex: 1, backgroundColor: '#2C2C2E', borderRadius: 12, padding: 14, alignItems: 'center', gap: 10 },
  sizeLabel:  { color: C.textMuted, fontSize: 13, fontWeight: '500' },
  sizeStepper:{ flexDirection: 'row', alignItems: 'center', gap: 16 },
  sizeVal:    { color: '#FFF', fontSize: 22, fontWeight: '700', minWidth: 28, textAlign: 'center' },
  stepBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#3A3A3C', alignItems: 'center', justifyContent: 'center' },
  stepTxt:    { color: '#FFF', fontSize: 20, fontWeight: '700', lineHeight: 24 },
});

// ─── Spreadsheet view ─────────────────────────────────────────────────────────
type CellPos = { row: number; col: number; area: 'header-row' | 'header-col' | 'body' };

function SpreadsheetView({ table, onUpdate, onClose }: {
  table: UserTable;
  onUpdate: (patch: Partial<UserTable>) => void;
  onClose: () => void;
}) {
  const accent = table.color;

  // local mutable state
  const [headerRows, setHeaderRows] = useState<string[][]>(table.headerRows);
  const [headerCols, setHeaderCols] = useState<string[][]>(table.headerCols);
  const [cells, setCells]           = useState<string[][]>(table.cells);
  const [selected, setSelected]     = useState<CellPos | null>(null);
  const [editing, setEditing]       = useState<CellPos | null>(null);
  const [editVal, setEditVal]       = useState('');

  // drag-to-add body rows/cols state
  const [rowPreview, setRowPreview] = useState(0);
  const [colPreview, setColPreview] = useState(0);
  const [rowDragActive, setRowDragActive] = useState(false);
  const [colDragActive, setColDragActive] = useState(false);

  // drag-to-add frozen rows/cols state
  const [frozenRowsDragActive, setFrozenRowsDragActive] = useState(false);
  const [frozenColsDragActive, setFrozenColsDragActive] = useState(false);

  // scroll animated values
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const bodyHScrollRef = useRef<ScrollView>(null);
  const bodyVScrollRef = useRef<ScrollView>(null);

  const numRows       = headerCols.length;
  const numCols       = headerRows[0]?.length ?? 0;
  const numFrozenRows = headerRows.length;
  const numFrozenCols = headerCols[0]?.length ?? 1;
  const fixedColsWidth = numFrozenCols * HDR_W;

  // ── commit helpers ──────────────────────────────────────────────────────────
  const save = useCallback((hr: string[][], hc: string[][], cs: string[][]) => {
    onUpdate({ headerRows: hr, headerCols: hc, cells: cs });
  }, [onUpdate]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const { row, col, area } = editing;
    if (area === 'header-row') {
      const next = headerRows.map(r => [...r]);
      next[row][col] = editVal;
      setHeaderRows(next); save(next, headerCols, cells);
    } else if (area === 'header-col') {
      const next = headerCols.map(r => [...r]);
      next[row][col] = editVal;
      setHeaderCols(next); save(headerRows, next, cells);
    } else {
      const next = cells.map(r => [...r]);
      next[row][col] = editVal;
      setCells(next); save(headerRows, headerCols, next);
    }
    setEditing(null);
  }, [editing, editVal, headerRows, headerCols, cells, save]);

  const startEdit = (pos: CellPos) => {
    let val = '';
    if (pos.area === 'header-row') val = headerRows[pos.row]?.[pos.col] ?? '';
    else if (pos.area === 'header-col') val = headerCols[pos.row]?.[pos.col] ?? '';
    else val = cells[pos.row]?.[pos.col] ?? '';
    setEditVal(val);
    setEditing(pos);
    setSelected(pos);
  };

  const isSelected = (pos: CellPos) =>
    selected?.area === pos.area && selected.row === pos.row && selected.col === pos.col;
  const isEditing = (pos: CellPos) =>
    editing?.area === pos.area && editing.row === pos.row && editing.col === pos.col;

  // ── add/remove body rows & cols ─────────────────────────────────────────────
  const applyRowPreview = useCallback((count: number) => {
    if (count <= 0) return;
    let nextCells = cells.map(r => [...r]);
    let nextHCols = headerCols.map(r => [...r]);
    for (let i = 0; i < count; i++) {
      const newRow = Array.from({ length: numCols }, (_, ci) => detectNext(nextCells.map(r => r[ci])));
      nextCells.push(newRow);
      const newHColRow = Array.from({ length: numFrozenCols }, (_, fci) => detectNext(nextHCols.map(r => r[fci])));
      nextHCols.push(newHColRow);
    }
    setHeaderCols(nextHCols);
    setCells(nextCells);
    save(headerRows, nextHCols, nextCells);
  }, [cells, headerCols, headerRows, numCols, numFrozenCols, save]);

  const applyColPreview = useCallback((count: number) => {
    if (count <= 0) return;
    let nextHRows = headerRows.map(r => [...r]);
    let nextCells = cells.map(r => [...r]);
    for (let i = 0; i < count; i++) {
      nextHRows = nextHRows.map(r => [...r, detectNext(r)]);
      nextCells = nextCells.map(r => [...r, detectNext(r)]);
    }
    setHeaderRows(nextHRows);
    setCells(nextCells);
    save(nextHRows, headerCols, nextCells);
  }, [cells, headerRows, headerCols, save]);

  const removeRows = useCallback((count: number) => {
    if (count <= 0 || headerCols.length <= 1) return;
    const remove = Math.min(count, headerCols.length - 1);
    const nextHCols = headerCols.slice(0, -remove);
    const nextCells = cells.slice(0, -remove);
    setHeaderCols(nextHCols);
    setCells(nextCells);
    save(headerRows, nextHCols, nextCells);
  }, [cells, headerCols, headerRows, save]);

  const removeCols = useCallback((count: number) => {
    if (count <= 0 || numCols <= 1) return;
    const remove = Math.min(count, numCols - 1);
    const nextHRows = headerRows.map(r => r.slice(0, -remove));
    const nextCells = cells.map(r => r.slice(0, -remove));
    setHeaderRows(nextHRows);
    setCells(nextCells);
    save(nextHRows, headerCols, nextCells);
  }, [cells, headerCols, headerRows, numCols, save]);

  // ── add/remove frozen rows & cols ───────────────────────────────────────────
  const applyFrozenRowsChange = useCallback((delta: number) => {
    if (delta > 0) {
      const add = Math.min(delta, 3 - headerRows.length);
      if (add <= 0) return;
      let nextHRows = headerRows.map(r => [...r]);
      for (let i = 0; i < add; i++) nextHRows.push(Array(numCols).fill(''));
      setHeaderRows(nextHRows);
      save(nextHRows, headerCols, cells);
    } else if (delta < 0) {
      const remove = Math.min(-delta, headerRows.length - 1);
      if (remove <= 0) return;
      const nextHRows = headerRows.slice(0, -remove);
      setHeaderRows(nextHRows);
      save(nextHRows, headerCols, cells);
    }
  }, [cells, headerCols, headerRows, numCols, save]);

  const applyFrozenColsChange = useCallback((delta: number) => {
    if (delta > 0) {
      const add = Math.min(delta, 3 - numFrozenCols);
      if (add <= 0) return;
      let nextHCols = headerCols.map(r => [...r]);
      for (let i = 0; i < add; i++) nextHCols = nextHCols.map(r => [...r, '']);
      setHeaderCols(nextHCols);
      save(headerRows, nextHCols, cells);
    } else if (delta < 0) {
      const remove = Math.min(-delta, numFrozenCols - 1);
      if (remove <= 0) return;
      const nextHCols = headerCols.map(r => r.slice(0, -remove));
      setHeaderCols(nextHCols);
      save(headerRows, nextHCols, cells);
    }
  }, [cells, headerCols, headerRows, numFrozenCols, save]);

  // ── callback refs (stale closure fix) ──────────────────────────────────────
  const applyRowPreviewRef   = useRef(applyRowPreview);
  const removeRowsRef        = useRef(removeRows);
  const applyColPreviewRef   = useRef(applyColPreview);
  const removeColsRef        = useRef(removeCols);
  const applyFrozenRowsRef   = useRef(applyFrozenRowsChange);
  const applyFrozenColsRef   = useRef(applyFrozenColsChange);
  applyRowPreviewRef.current  = applyRowPreview;
  removeRowsRef.current       = removeRows;
  applyColPreviewRef.current  = applyColPreview;
  removeColsRef.current       = removeCols;
  applyFrozenRowsRef.current  = applyFrozenRowsChange;
  applyFrozenColsRef.current  = applyFrozenColsChange;

  // ── drag: body rows ─────────────────────────────────────────────────────────
  const rowDragState = useRef({ active: false, startY: 0, lastDelta: 0 });
  const rowPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { rowDragState.current = { active: true, startY: e.nativeEvent.pageY, lastDelta: 0 }; setRowDragActive(true); },
    onPanResponderMove: (e) => {
      if (!rowDragState.current.active) return;
      const delta = Math.round((e.nativeEvent.pageY - rowDragState.current.startY) / ROW_H);
      if (delta !== rowDragState.current.lastDelta) { rowDragState.current.lastDelta = delta; setRowPreview(Math.max(0, delta)); }
    },
    onPanResponderRelease: () => {
      const delta = rowDragState.current.lastDelta;
      rowDragState.current = { active: false, startY: 0, lastDelta: 0 }; setRowPreview(0); setRowDragActive(false);
      if (delta > 0) applyRowPreviewRef.current(delta); else if (delta < 0) removeRowsRef.current(-delta);
    },
    onPanResponderTerminate: () => { rowDragState.current = { active: false, startY: 0, lastDelta: 0 }; setRowPreview(0); setRowDragActive(false); },
  })).current;

  // ── drag: body cols ─────────────────────────────────────────────────────────
  const colDragState = useRef({ active: false, startX: 0, lastDelta: 0 });
  const colPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => colDragState.current.active,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { colDragState.current = { active: true, startX: e.nativeEvent.pageX, lastDelta: 0 }; setColDragActive(true); },
    onPanResponderMove: (e) => {
      if (!colDragState.current.active) return;
      const delta = Math.round((e.nativeEvent.pageX - colDragState.current.startX) / COL_W);
      if (delta !== colDragState.current.lastDelta) { colDragState.current.lastDelta = delta; setColPreview(Math.max(0, delta)); }
    },
    onPanResponderRelease: () => {
      const delta = colDragState.current.lastDelta;
      colDragState.current = { active: false, startX: 0, lastDelta: 0 }; setColPreview(0); setColDragActive(false);
      if (delta > 0) applyColPreviewRef.current(delta); else if (delta < 0) removeColsRef.current(-delta);
    },
    onPanResponderTerminate: () => { colDragState.current = { active: false, startX: 0, lastDelta: 0 }; setColPreview(0); setColDragActive(false); },
  })).current;

  // ── drag: frozen rows ───────────────────────────────────────────────────────
  const frozenRowsDragState = useRef({ active: false, startY: 0, lastDelta: 0 });
  const frozenRowsPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { frozenRowsDragState.current = { active: true, startY: e.nativeEvent.pageY, lastDelta: 0 }; setFrozenRowsDragActive(true); },
    onPanResponderMove: (e) => {
      if (!frozenRowsDragState.current.active) return;
      const dy = e.nativeEvent.pageY - frozenRowsDragState.current.startY;
      const delta = Math.sign(dy) * Math.floor(Math.abs(dy) / HDR_H);
      if (delta !== frozenRowsDragState.current.lastDelta) frozenRowsDragState.current.lastDelta = delta;
    },
    onPanResponderRelease: () => {
      const delta = frozenRowsDragState.current.lastDelta;
      frozenRowsDragState.current = { active: false, startY: 0, lastDelta: 0 }; setFrozenRowsDragActive(false);
      applyFrozenRowsRef.current(delta);
    },
    onPanResponderTerminate: () => { frozenRowsDragState.current = { active: false, startY: 0, lastDelta: 0 }; setFrozenRowsDragActive(false); },
  })).current;

  // ── drag: frozen cols ───────────────────────────────────────────────────────
  const frozenColsDragState = useRef({ active: false, startX: 0, lastDelta: 0 });
  const frozenColsPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => frozenColsDragState.current.active,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { frozenColsDragState.current = { active: true, startX: e.nativeEvent.pageX, lastDelta: 0 }; setFrozenColsDragActive(true); },
    onPanResponderMove: (e) => {
      if (!frozenColsDragState.current.active) return;
      const dx = e.nativeEvent.pageX - frozenColsDragState.current.startX;
      const delta = Math.sign(dx) * Math.floor(Math.abs(dx) / HDR_W);
      if (delta !== frozenColsDragState.current.lastDelta) frozenColsDragState.current.lastDelta = delta;
    },
    onPanResponderRelease: () => {
      const delta = frozenColsDragState.current.lastDelta;
      frozenColsDragState.current = { active: false, startX: 0, lastDelta: 0 }; setFrozenColsDragActive(false);
      applyFrozenColsRef.current(delta);
    },
    onPanResponderTerminate: () => { frozenColsDragState.current = { active: false, startX: 0, lastDelta: 0 }; setFrozenColsDragActive(false); },
  })).current;

  return (
    <Modal visible animationType="slide" onRequestClose={() => { commitEdit(); onClose(); }}>
      <View style={sv.container}>

        {/* Top bar */}
        <View style={sv.topBar}>
          <TouchableOpacity style={sv.backBtn} onPress={() => { commitEdit(); onClose(); }}>
            <Ionicons name="chevron-back" size={22} color={accent} />
            <Text style={[sv.backTxt, { color: accent }]}>Tabelle</Text>
          </TouchableOpacity>
          <Text style={sv.topTitle} numberOfLines={1}>{table.name}</Text>
          <TouchableOpacity
            style={sv.topRight}
            onPress={() => {
              if (!selected) return;
              Alert.alert(
                selected.area === 'body' ? 'Elimina riga' : 'Opzioni',
                selected.area === 'body' ? `Eliminare la riga ${selected.row + 1}?` : 'Cosa vuoi fare?',
                selected.area === 'body'
                  ? [
                      { text: 'Annulla', style: 'cancel' },
                      { text: 'Elimina riga', style: 'destructive', onPress: () => {
                          const nextHCols = headerCols.filter((_, i) => i !== selected.row);
                          const nextCells = cells.filter((_, i) => i !== selected.row);
                          setHeaderCols(nextHCols); setCells(nextCells);
                          save(headerRows, nextHCols, nextCells); setSelected(null);
                      }},
                    ]
                  : [{ text: 'OK', style: 'cancel' }]
              );
            }}
            disabled={!selected}
          >
            <Ionicons name="trash-outline" size={19} color={selected?.area === 'body' ? '#FF375F' : '#48484A'} />
          </TouchableOpacity>
        </View>

        {/* Formula bar */}
        <View style={sv.formulaBar}>
          <Text style={sv.formulaRef}>
            {selected
              ? selected.area === 'header-row' ? `H${selected.row + 1}.${selected.col + 1}`
              : selected.area === 'header-col' ? `R${selected.row + 1}.${selected.col + 1}`
              : `${String.fromCharCode(65 + selected.col)}${selected.row + 1}`
              : ''}
          </Text>
          {editing ? (
            <>
              <TextInput style={sv.formulaInput} value={editVal} onChangeText={setEditVal} onSubmitEditing={commitEdit} returnKeyType="done" autoFocus={false} />
              <TouchableOpacity onPress={() => setEditing(null)} style={sv.fBtn}><Ionicons name="close" size={17} color="#FF375F" /></TouchableOpacity>
              <TouchableOpacity onPress={commitEdit} style={sv.fBtn}><Ionicons name="checkmark" size={17} color="#30D158" /></TouchableOpacity>
            </>
          ) : (
            <Text style={sv.formulaStatic} numberOfLines={1}>
              {selected
                ? selected.area === 'header-row' ? (headerRows[selected.row]?.[selected.col] ?? '')
                : selected.area === 'header-col' ? (headerCols[selected.row]?.[selected.col] ?? '')
                : (cells[selected.row]?.[selected.col] ?? '')
                : ''}
            </Text>
          )}
        </View>

        {/* Grid */}
        <View style={{ flex: 1 }}>

          {/* AREA FISSA IN CIMA: angolo + righe fisse (scroll orizzontale) */}
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: fixedColsWidth, height: numFrozenRows * HDR_H, backgroundColor: C.headerBg }} />
            <View style={{ flex: 1, overflow: 'hidden', height: numFrozenRows * HDR_H }}>
              <Animated.View style={{ transform: [{ translateX: Animated.multiply(scrollX, -1) }] }}>
                {headerRows.map((hRow, fri) => {
                  const isLastFrozenRow = fri === numFrozenRows - 1;
                  return (
                    <View key={fri} style={{ flexDirection: 'row' }}>
                      {hRow.map((h, ci) => {
                        const pos: CellPos = { row: fri, col: ci, area: 'header-row' };
                        const sel = isSelected(pos);
                        const edit = isEditing(pos);
                        return (
                          <Pressable
                            key={ci}
                            style={[sv.colHeader, sel && sv.headerSel]}
                            onPress={() => { if (editing) { commitEdit(); return; } if (sel) startEdit(pos); else setSelected(pos); }}
                          >
                            {edit ? (
                              <TextInput style={sv.headerInput} value={editVal} onChangeText={setEditVal} onSubmitEditing={commitEdit} onBlur={commitEdit} autoFocus returnKeyType="done" selectTextOnFocus />
                            ) : (
                              <Text style={sv.colHeaderName} numberOfLines={1}>{h}</Text>
                            )}
                          </Pressable>
                        );
                      })}
                      {isLastFrozenRow && Array.from({ length: colPreview }).map((_, i) => (
                        <View key={`prev-ch-${i}`} style={[sv.colHeader, { opacity: 0.4 }]} />
                      ))}
                      {isLastFrozenRow && (
                        <View style={[sv.colDragHandle, colDragActive && { backgroundColor: accent, opacity: 0.85 }]} {...colPanResponder.panHandlers} />
                      )}
                    </View>
                  );
                })}
              </Animated.View>
            </View>
          </View>

          {/* LINEA COLORATA ORIZZONTALE — trascina su/giù per aggiungere/togliere righe fisse */}
          <View style={{ flexDirection: 'row', height: 4 }}>
            <View style={{ width: fixedColsWidth, backgroundColor: C.headerBg }} />
            <View style={{ flex: 1, backgroundColor: frozenRowsDragActive ? accent : accent + 'CC' }} {...frozenRowsPanResponder.panHandlers} />
          </View>

          {/* CORPO: colonne fisse + linea verticale + celle scrollabili */}
          <View style={{ flex: 1, flexDirection: 'row' }}>

            {/* Colonne fisse (scroll verticale) */}
            <View style={{ width: fixedColsWidth, overflow: 'hidden', backgroundColor: '#000' }}>
              <Animated.View style={{ transform: [{ translateY: Animated.multiply(scrollY, -1) }] }}>
                {Array.from({ length: numRows + rowPreview }).map((_, ri) => {
                  const isPreviewRow = ri >= numRows;
                  const isLastRow = ri === numRows + rowPreview - 1;
                  const thickBorder = isLastRow ? { borderBottomWidth: 5, borderBottomColor: rowDragActive ? accent : '#58585A' } : {};
                  return (
                    <View key={ri} style={{ flexDirection: 'row', position: 'relative' }}>
                      {Array.from({ length: numFrozenCols }).map((_, fci) => {
                        const hColVal = isPreviewRow
                          ? (() => { const base = headerCols.map(r => r[fci]); for (let k = numRows; k <= ri; k++) base.push(detectNext(base)); return base[ri]; })()
                          : (headerCols[ri]?.[fci] ?? '');
                        const pos: CellPos = { row: ri, col: fci, area: 'header-col' };
                        const sel = isSelected(pos);
                        const edit = isEditing(pos);
                        return (
                          <Pressable
                            key={fci}
                            style={[sv.rowHeader, thickBorder, sel && sv.headerSel, isPreviewRow && { opacity: 0.4 }]}
                            onPress={() => { if (isPreviewRow) return; if (editing) { commitEdit(); return; } if (sel) startEdit(pos); else setSelected(pos); }}
                          >
                            {edit && !isPreviewRow ? (
                              <TextInput style={sv.headerInput} value={editVal} onChangeText={setEditVal} onSubmitEditing={commitEdit} onBlur={commitEdit} autoFocus returnKeyType="done" selectTextOnFocus />
                            ) : (
                              <Text style={sv.rowHeaderText} numberOfLines={1}>{hColVal}</Text>
                            )}
                          </Pressable>
                        );
                      })}
                      {isLastRow && (
                        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10 }} {...rowPanResponder.panHandlers} />
                      )}
                    </View>
                  );
                })}
              </Animated.View>
            </View>

            {/* LINEA COLORATA VERTICALE — trascina destra/sinistra per aggiungere/togliere colonne fisse */}
            <View
              style={{ width: 4, alignSelf: 'flex-start', height: (numRows + rowPreview) * ROW_H, backgroundColor: frozenColsDragActive ? accent : accent + 'CC' }}
              {...frozenColsPanResponder.panHandlers}
            />

            {/* Celle body */}
            <ScrollView
              ref={bodyVScrollRef}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: false }
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={{ flex: 1, backgroundColor: '#000' }}
            >
              <ScrollView
                horizontal
                ref={bodyHScrollRef}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  { useNativeDriver: false }
                )}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                bounces={false}
              >
                <View>
                  {Array.from({ length: numRows + rowPreview }).map((_, ri) => {
                    const isPreviewRow = ri >= numRows;
                    return (
                      <View key={ri} style={{ flexDirection: 'row' }}>
                        {Array.from({ length: numCols + colPreview }).map((_, ci) => {
                          const isPreviewCol = ci >= numCols;
                          const pos: CellPos = { row: ri, col: ci, area: 'body' };
                          const val = isPreviewRow || isPreviewCol ? '' : (cells[ri]?.[ci] ?? '');
                          const sel = isSelected(pos);
                          const edit = isEditing(pos);
                          return (
                            <Pressable
                              key={ci}
                              style={[sv.cell, ri % 2 === 1 && sv.cellAlt, sel && sv.cellSel, (isPreviewRow || isPreviewCol) && { opacity: 0.35 }]}
                              onPress={() => { if (isPreviewRow || isPreviewCol) return; if (editing) { commitEdit(); return; } if (sel) startEdit(pos); else setSelected(pos); }}
                            >
                              {edit && !isPreviewRow && !isPreviewCol ? (
                                <TextInput style={sv.cellInput} value={editVal} onChangeText={setEditVal} onSubmitEditing={commitEdit} onBlur={commitEdit} autoFocus returnKeyType="done" selectTextOnFocus />
                              ) : (
                                <Text style={sv.cellText} numberOfLines={1}>{val}</Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </ScrollView>

          </View>
        </View>

      </View>
    </Modal>
  );
}

const sv = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.canvas },
  topBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 10, backgroundColor: C.headerBg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine },
  backBtn:    { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70 },
  backTxt:    { fontSize: 17 },
  topTitle:   { color: C.textPrimary, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  topRight:   { minWidth: 70, alignItems: 'flex-end', paddingRight: 4 },

  formulaBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#252528', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, gap: 8, minHeight: 38 },
  formulaRef: { color: C.textMuted, fontSize: 12, fontWeight: '600', minWidth: 32 },
  formulaInput: { flex: 1, color: C.textPrimary, fontSize: 14, padding: 0 },
  formulaStatic: { flex: 1, color: C.textHeader, fontSize: 14 },
  fBtn:       { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },

  colHeader:  { width: COL_W, height: HDR_H, backgroundColor: C.headerBg, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, paddingHorizontal: 6 },
  colHeaderName: { color: C.textHeader, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  headerSel:  { backgroundColor: '#0A84FF22' },
  headerInput:{ color: C.textPrimary, fontSize: 12, fontWeight: '600', padding: 0, textAlign: 'center', width: '100%' },
  colDragHandle: { width: 5, height: HDR_H, backgroundColor: '#58585A' },

  rowHeader:  { width: HDR_W, height: ROW_H, backgroundColor: C.headerBg, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, paddingHorizontal: 4 },
  rowHeaderText: { color: C.textHeader, fontSize: 12, fontWeight: '500', textAlign: 'center' },

  cell:       { width: COL_W, height: ROW_H, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: C.cellBg },
  cellAlt:    { backgroundColor: C.cellAlt },
  cellSel:    { backgroundColor: '#0A84FF18', borderWidth: 1.5, borderColor: '#0A84FF' },
  cellText:   { color: C.textHeader, fontSize: 13 },
  cellInput:  { color: C.textPrimary, fontSize: 13, padding: 0, flex: 1 },


});

// ─── Main export ──────────────────────────────────────────────────────────────
export default function TabelleView() {
  const { tables, addTable, updateTable, deleteTable } = useHabits();
  const [showCreate, setShowCreate] = useState(false);
  const [openTable, setOpenTable]   = useState<UserTable | null>(null);

  const handleDelete = (t: UserTable) =>
    Alert.alert('Elimina tabella', `Eliminare "${t.name}"?`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: () => deleteTable(t.id) },
    ]);

  return (
    <View style={mv.container}>
      <View style={mv.toolbar}>
        <Text style={mv.toolbarSub}>{tables.length > 0 ? `${tables.length} tabella${tables.length !== 1 ? 'e' : ''}` : ''}</Text>
        <TouchableOpacity style={mv.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={22} color={C.accent} />
        </TouchableOpacity>
      </View>

      {tables.length === 0 ? (
        <View style={mv.empty}>
          <View style={mv.emptyIcon}><Ionicons name="grid-outline" size={44} color="#48484A" /></View>
          <Text style={mv.emptyTitle}>Nessuna tabella</Text>
          <Text style={mv.emptyHint}>Tocca + per creare la tua prima tabella</Text>
          <TouchableOpacity style={mv.emptyBtn} onPress={() => setShowCreate(true)}>
            <Text style={mv.emptyBtnTxt}>Crea tabella</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={mv.grid}>
          {tables.map(t => (
            <TableCard key={t.id} table={t} onPress={() => setOpenTable(t)} onLongPress={() => handleDelete(t)} />
          ))}
        </ScrollView>
      )}

      <CreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(name, color, cols, rows) => addTable(name, color, cols, rows)}
      />

      {openTable && (
        <SpreadsheetView
          table={openTable}
          onUpdate={(patch) => {
            updateTable(openTable.id, patch);
            setOpenTable(prev => prev ? { ...prev, ...patch } : null);
          }}
          onClose={() => setOpenTable(null)}
        />
      )}
    </View>
  );
}

const mv = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.canvas },
  toolbar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 4 },
  toolbarSub:  { color: C.textMuted, fontSize: 13 },
  addBtn:      { padding: 4 },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
  emptyIcon:   { width: 80, height: 80, borderRadius: 20, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:  { color: '#FFF', fontSize: 20, fontWeight: '700' },
  emptyHint:   { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn:    { marginTop: 12, backgroundColor: C.accent, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 },
  emptyBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 120 },
});
