import { useHabits } from '@/lib/habits/Provider';
import type { UserTable } from '@/lib/habits/schema';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import {
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
  const cols = Math.min(table.headerRow.length, 4);
  const rows = Math.min(table.headerCol.length, 3);
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
      <Text style={dc.meta}>{table.headerCol.length} rig · {table.headerRow.length} col</Text>
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
  const [headerRow, setHeaderRow] = useState<string[]>(table.headerRow);
  const [headerCol, setHeaderCol] = useState<string[]>(table.headerCol);
  const [cells, setCells]         = useState<string[][]>(table.cells);
  const [selected, setSelected]   = useState<CellPos | null>(null);
  const [editing, setEditing]     = useState<CellPos | null>(null);
  const [editVal, setEditVal]     = useState('');

  // drag-to-add state
  const [rowPreview, setRowPreview] = useState(0);
  const [colPreview, setColPreview] = useState(0);
  const [rowDragActive, setRowDragActive] = useState(false);
  const [colDragActive, setColDragActive] = useState(false);

  // scroll sync refs
  const colHdrScrollRef = useRef<ScrollView>(null);
  const rowHdrScrollRef = useRef<ScrollView>(null);
  const bodyHScrollRef  = useRef<ScrollView>(null);
  const bodyVScrollRef  = useRef<ScrollView>(null);


  const numRows = headerCol.length;
  const numCols = headerRow.length;

  // ── commit helpers ──────────────────────────────────────────────────────────
  const save = useCallback((hr: string[], hc: string[], cs: string[][]) => {
    onUpdate({ headerRow: hr, headerCol: hc, cells: cs });
  }, [onUpdate]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const { row, col, area } = editing;
    if (area === 'header-row') {
      const next = [...headerRow]; next[col] = editVal;
      setHeaderRow(next); save(next, headerCol, cells);
    } else if (area === 'header-col') {
      const next = [...headerCol]; next[row] = editVal;
      setHeaderCol(next); save(headerRow, next, cells);
    } else {
      const next = cells.map(r => [...r]);
      next[row][col] = editVal;
      setCells(next); save(headerRow, headerCol, next);
    }
    setEditing(null);
  }, [editing, editVal, headerRow, headerCol, cells, save]);

  const startEdit = (pos: CellPos) => {
    let val = '';
    if (pos.area === 'header-row') val = headerRow[pos.col] ?? '';
    else if (pos.area === 'header-col') val = headerCol[pos.row] ?? '';
    else val = cells[pos.row]?.[pos.col] ?? '';
    setEditVal(val);
    setEditing(pos);
    setSelected(pos);
  };

  const isSelected = (pos: CellPos) =>
    selected?.area === pos.area && selected.row === pos.row && selected.col === pos.col;
  const isEditing = (pos: CellPos) =>
    editing?.area === pos.area && editing.row === pos.row && editing.col === pos.col;

  // ── add/remove rows & cols ─────────────────────────────────────────────────
  const applyRowPreview = useCallback((count: number) => {
    if (count <= 0) return;
    // auto-sequence for each column
    const newCells = Array.from({ length: count }, (_, ri) =>
      Array.from({ length: numCols }, (__, ci) => {
        const colVals = cells.map(r => r[ci]);
        return ri === 0 ? detectNext(colVals) : detectNext([...colVals, ...Array.from({ length: ri }, (_, j) => detectNext(colVals.concat(Array.from({ length: j }, (__, k) => detectNext(colVals.slice(0, -1))))))]); // simplified: just detectNext of growing array
      })
    );

    // simpler sequential approach
    let nextCells = [...cells.map(r => [...r])];
    let nextHCol  = [...headerCol];
    for (let i = 0; i < count; i++) {
      const newRow = Array.from({ length: numCols }, (_, ci) => detectNext(nextCells.map(r => r[ci])));
      nextCells.push(newRow);
      nextHCol.push(detectNext(nextHCol));
    }
    setHeaderCol(nextHCol);
    setCells(nextCells);
    save(headerRow, nextHCol, nextCells);
  }, [cells, headerCol, headerRow, numCols, save]);

  const applyColPreview = useCallback((count: number) => {
    if (count <= 0) return;
    let nextHRow = [...headerRow];
    let nextCells = cells.map(r => [...r]);
    for (let i = 0; i < count; i++) {
      nextHRow.push(detectNext(nextHRow));
      nextCells = nextCells.map(r => [...r, detectNext(r)]);
    }
    setHeaderRow(nextHRow);
    setCells(nextCells);
    save(nextHRow, headerCol, nextCells);
  }, [cells, headerRow, headerCol, save]);

  const removeRows = useCallback((count: number) => {
    if (count <= 0 || headerCol.length <= 1) return;
    const remove = Math.min(count, headerCol.length - 1);
    const nextHCol  = headerCol.slice(0, -remove);
    const nextCells = cells.slice(0, -remove);
    setHeaderCol(nextHCol);
    setCells(nextCells);
    save(headerRow, nextHCol, nextCells);
  }, [cells, headerCol, headerRow, save]);

  const removeCols = useCallback((count: number) => {
    if (count <= 0 || headerRow.length <= 1) return;
    const remove = Math.min(count, headerRow.length - 1);
    const nextHRow  = headerRow.slice(0, -remove);
    const nextCells = cells.map(r => r.slice(0, -remove));
    setHeaderRow(nextHRow);
    setCells(nextCells);
    save(nextHRow, headerCol, nextCells);
  }, [cells, headerCol, headerRow, save]);

  // ── latest-callback refs (fixes stale closure in PanResponder) ─────────────
  const applyRowPreviewRef = useRef(applyRowPreview);
  const removeRowsRef      = useRef(removeRows);
  const applyColPreviewRef = useRef(applyColPreview);
  const removeColsRef      = useRef(removeCols);
  applyRowPreviewRef.current = applyRowPreview;
  removeRowsRef.current      = removeRows;
  applyColPreviewRef.current = applyColPreview;
  removeColsRef.current      = removeCols;

  // ── drag-to-add row (PanResponder on bottom handle) ─────────────────────────
  const rowDragState = useRef({ active: false, startY: 0, lastDelta: 0 });

  const rowPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      rowDragState.current = { active: true, startY: e.nativeEvent.pageY, lastDelta: 0 };
      setRowDragActive(true);
    },
    onPanResponderMove: (e) => {
      if (!rowDragState.current.active) return;
      const dy = e.nativeEvent.pageY - rowDragState.current.startY;
      const delta = Math.round(dy / ROW_H);
      if (delta !== rowDragState.current.lastDelta) {
        rowDragState.current.lastDelta = delta;
        setRowPreview(Math.max(0, delta));
      }
    },
    onPanResponderRelease: () => {
      const delta = rowDragState.current.lastDelta;
      rowDragState.current = { active: false, startY: 0, lastDelta: 0 };
      setRowPreview(0);
      setRowDragActive(false);
      if (delta > 0) applyRowPreviewRef.current(delta);
      else if (delta < 0) removeRowsRef.current(-delta);
    },
    onPanResponderTerminate: () => {
      rowDragState.current = { active: false, startY: 0, lastDelta: 0 };
      setRowPreview(0);
      setRowDragActive(false);
    },
  })).current;

  // ── drag-to-add col (PanResponder on right handle) ──────────────────────────
  const colDragState = useRef({ active: false, startX: 0, lastDelta: 0 });

  const colPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder:  () => colDragState.current.active,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      colDragState.current = { active: true, startX: e.nativeEvent.pageX, lastDelta: 0 };
      setColDragActive(true);
    },
    onPanResponderMove: (e) => {
      if (!colDragState.current.active) return;
      const dx = e.nativeEvent.pageX - colDragState.current.startX;
      const delta = Math.round(dx / COL_W);
      if (delta !== colDragState.current.lastDelta) {
        colDragState.current.lastDelta = delta;
        setColPreview(Math.max(0, delta));
      }
    },
    onPanResponderRelease: () => {
      const delta = colDragState.current.lastDelta;
      colDragState.current = { active: false, startX: 0, lastDelta: 0 };
      setColPreview(0);
      setColDragActive(false);
      if (delta > 0) applyColPreviewRef.current(delta);
      else if (delta < 0) removeColsRef.current(-delta);
    },
    onPanResponderTerminate: () => {
      colDragState.current = { active: false, startX: 0, lastDelta: 0 };
      setColPreview(0);
      setColDragActive(false);
    },
  })).current;

  // ── cell renderer ───────────────────────────────────────────────────────────
  const renderCell = (pos: CellPos, value: string, style?: object) => {
    const sel  = isSelected(pos);
    const edit = isEditing(pos);
    return (
      <Pressable
        key={`${pos.area}-${pos.row}-${pos.col}`}
        style={[sv.cell, style, sel && sv.cellSel]}
        onPress={() => {
          if (editing) { commitEdit(); return; }
          if (sel) startEdit(pos);
          else setSelected(pos);
        }}
      >
        {edit ? (
          <TextInput
            style={sv.cellInput}
            value={editVal}
            onChangeText={setEditVal}
            onSubmitEditing={commitEdit}
            onBlur={commitEdit}
            autoFocus
            returnKeyType="done"
            selectTextOnFocus
          />
        ) : (
          <Text style={[sv.cellText, style && (style as any).color ? {} : {}]} numberOfLines={1}>{value}</Text>
        )}
      </Pressable>
    );
  };

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
                          const nextHCol  = headerCol.filter((_, i) => i !== selected.row);
                          const nextCells = cells.filter((_, i) => i !== selected.row);
                          setHeaderCol(nextHCol); setCells(nextCells);
                          save(headerRow, nextHCol, nextCells); setSelected(null);
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
              ? selected.area === 'header-row' ? `H${selected.col + 1}`
              : selected.area === 'header-col' ? `R${selected.row + 1}`
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
                ? selected.area === 'header-row' ? headerRow[selected.col]
                : selected.area === 'header-col' ? headerCol[selected.row]
                : cells[selected.row]?.[selected.col] ?? ''
                : ''}
            </Text>
          )}
        </View>

        {/* Grid — frozen corner+headers, scrollable body */}
        <View style={{ flex: 1 }}>

          {/* Fixed top: corner + column headers */}
          <View style={{ flexDirection: 'row' }}>
            <View style={[sv.cornerCell, { borderBottomColor: accent, borderBottomWidth: 2 }]} />
            <ScrollView
              horizontal
              scrollEnabled={false}
              ref={colHdrScrollRef}
              showsHorizontalScrollIndicator={false}
              bounces={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexDirection: 'row' }}
            >
              {headerRow.map((h, ci) => {
                const pos: CellPos = { row: 0, col: ci, area: 'header-row' };
                const sel = isSelected(pos);
                const edit = isEditing(pos);
                return (
                  <Pressable
                    key={ci}
                    style={[sv.colHeader, { borderBottomColor: accent, borderBottomWidth: 2 }, sel && sv.headerSel]}
                    onPress={() => { if (editing) { commitEdit(); return; } if (sel) startEdit(pos); else setSelected(pos); }}
                  >
                    <Text style={sv.colLetter}>{String.fromCharCode(65 + ci)}</Text>
                    {edit ? (
                      <TextInput style={sv.headerInput} value={editVal} onChangeText={setEditVal} onSubmitEditing={commitEdit} onBlur={commitEdit} autoFocus returnKeyType="done" selectTextOnFocus />
                    ) : (
                      <Text style={sv.colHeaderName} numberOfLines={1}>{h}</Text>
                    )}
                  </Pressable>
                );
              })}
              {Array.from({ length: colPreview }).map((_, i) => (
                <View key={`prev-ch-${i}`} style={[sv.colHeader, { borderBottomColor: accent, borderBottomWidth: 2, opacity: 0.4 }]}>
                  <Text style={sv.colLetter}>{String.fromCharCode(65 + numCols + i)}</Text>
                </View>
              ))}
              <View style={[sv.colDragHandle, colDragActive && { backgroundColor: accent, opacity: 0.85 }]} {...colPanResponder.panHandlers} />
            </ScrollView>
          </View>

          {/* Body: fixed row headers (left) + scrollable cells */}
          <View style={{ flex: 1, flexDirection: 'row' }}>

            {/* Fixed left: row headers — scrolls only when synced with body */}
            <ScrollView
              scrollEnabled={false}
              ref={rowHdrScrollRef}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {Array.from({ length: numRows + rowPreview }).map((_, ri) => {
                const isPreviewRow = ri >= numRows;
                const isLastRow = ri === numRows + rowPreview - 1;
                const hColVal = isPreviewRow
                  ? (() => { const base = [...headerCol]; for (let k = numRows; k <= ri; k++) base.push(detectNext(base)); return base[ri]; })()
                  : headerCol[ri];
                const thickBorder = isLastRow ? { borderBottomWidth: 5, borderBottomColor: rowDragActive ? accent : '#58585A' } : {};
                const pos: CellPos = { row: ri, col: 0, area: 'header-col' };
                const sel = isSelected(pos);
                const edit = isEditing(pos);
                return (
                  <View key={ri} style={{ position: 'relative' }}>
                    <Pressable
                      style={[sv.rowHeader, thickBorder, sel && sv.headerSel, isPreviewRow && { opacity: 0.4 }]}
                      onPress={() => { if (isPreviewRow) return; if (editing) { commitEdit(); return; } if (sel) startEdit(pos); else setSelected(pos); }}
                    >
                      {edit && !isPreviewRow ? (
                        <TextInput style={sv.headerInput} value={editVal} onChangeText={setEditVal} onSubmitEditing={commitEdit} onBlur={commitEdit} autoFocus returnKeyType="done" selectTextOnFocus />
                      ) : (
                        <Text style={sv.rowHeaderText} numberOfLines={1}>{hColVal}</Text>
                      )}
                    </Pressable>
                    {isLastRow && (
                      <View
                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10 }}
                        {...rowPanResponder.panHandlers}
                      />
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {/* Body cells: vertical outer (syncs row headers) → horizontal inner (syncs col headers) */}
            <ScrollView
              ref={bodyVScrollRef}
              onScroll={e => rowHdrScrollRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false })}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={{ flex: 1 }}
            >
              <ScrollView
                horizontal
                ref={bodyHScrollRef}
                onScroll={e => colHdrScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false })}
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

        {/* Bottom toolbar */}
        <View style={sv.bottomBar}>
          <TouchableOpacity style={sv.bottomBtn} onPress={() => applyRowPreview(1)}>
            <Ionicons name="add" size={19} color={accent} />
            <Text style={[sv.bottomTxt, { color: accent }]}>Riga</Text>
          </TouchableOpacity>
          <View style={sv.sep} />
          <TouchableOpacity style={sv.bottomBtn} onPress={() => applyColPreview(1)}>
            <Ionicons name="add" size={19} color={accent} />
            <Text style={[sv.bottomTxt, { color: accent }]}>Colonna</Text>
          </TouchableOpacity>
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

  cornerCell: { width: HDR_W, height: HDR_H, backgroundColor: C.headerBg, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, borderBottomColor: C.gridLine },
  colHeader:  { width: COL_W, height: HDR_H, backgroundColor: C.headerBg, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, paddingHorizontal: 6, gap: 1 },
  colLetter:  { color: C.textMuted, fontSize: 9, fontWeight: '500' },
  colHeaderName: { color: C.textHeader, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  headerSel:  { backgroundColor: '#0A84FF22' },
  headerInput:{ color: C.textPrimary, fontSize: 12, fontWeight: '600', padding: 0, textAlign: 'center', width: '100%' },
  colDragHandle: { width: 5, height: HDR_H, backgroundColor: '#58585A' },

  rowHeader:  { width: HDR_W, height: ROW_H, backgroundColor: C.headerBg, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, paddingHorizontal: 4 },
  rowHeaderText: { color: C.textMuted, fontSize: 12, fontWeight: '500', textAlign: 'center' },

  cell:       { width: COL_W, height: ROW_H, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: C.cellBg },
  cellAlt:    { backgroundColor: C.cellAlt },
  cellSel:    { backgroundColor: '#0A84FF18', borderWidth: 1.5, borderColor: '#0A84FF' },
  cellText:   { color: C.textHeader, fontSize: 13 },
  cellInput:  { color: C.textPrimary, fontSize: 13, padding: 0, flex: 1 },


  bottomBar:  { flexDirection: 'row', backgroundColor: C.headerBg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.gridLine, paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
  bottomBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  bottomTxt:  { fontSize: 14, fontWeight: '500' },
  sep:        { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: C.gridLine, alignSelf: 'center' },
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
