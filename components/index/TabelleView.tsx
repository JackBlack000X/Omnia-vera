import { useHabits } from '@/lib/habits/Provider';
import type { UserTable } from '@/lib/habits/schema';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
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

// ─── Colors (dark mode, Numbers-inspired) ───────────────────────────────────
const C = {
  canvas:       '#1C1C1E',
  headerCell:   '#3A3A3C',
  bodyCell:     '#2C2C2E',
  bodyAlt:      '#1C1C1E',
  gridLine:     '#48484A',
  border:       '#48484A',
  accent:       '#0A84FF',
  textPrimary:  '#FFFFFF',
  textSecondary:'#EBEBF5',
  textMuted:    '#8E8E93',
  surface:      '#2C2C2E',
  surfaceDeep:  '#1C1C1E',
};

const COL_W  = 110;
const ROW_H  = 44;
const IDX_W  = 36;  // row-number gutter

// ─── Thumbnail preview of a table (shown on card) ──────────────────────────
function TableThumbnail({ table, accentColor }: { table: UserTable; accentColor: string }) {
  const cols = table.columns.slice(0, 4);
  const rows = table.rows.slice(0, 4);
  const cellW = cols.length > 0 ? Math.floor(90 / cols.length) : 22;
  const cellH = 10;
  return (
    <View style={th.wrap}>
      {/* header row */}
      <View style={th.row}>
        {cols.map((_, i) => (
          <View key={i} style={[th.cell, { width: cellW, height: cellH, backgroundColor: accentColor }]} />
        ))}
        {cols.length === 0 && <View style={[th.cell, { width: 90, height: cellH, backgroundColor: accentColor }]} />}
      </View>
      {/* body rows */}
      {[0, 1, 2, 3].map(ri => (
        <View key={ri} style={th.row}>
          {cols.map((col, ci) => (
            <View key={ci} style={[th.cell, { width: cellW, height: cellH, backgroundColor: ri % 2 === 0 ? '#3A3A3C' : '#2C2C2E' }]}>
              {rows[ri] && rows[ri][col] ? (
                <View style={{ width: '60%', height: 3, backgroundColor: '#FFFFFF40', borderRadius: 1 }} />
              ) : null}
            </View>
          ))}
          {cols.length === 0 && (
            <View style={[th.cell, { width: 90, height: cellH, backgroundColor: ri % 2 === 0 ? '#3A3A3C' : '#2C2C2E' }]} />
          )}
        </View>
      ))}
    </View>
  );
}
const th = StyleSheet.create({
  wrap: { gap: 1 },
  row:  { flexDirection: 'row', gap: 1 },
  cell: { borderRadius: 1 },
});

// ─── Document card (home grid) ──────────────────────────────────────────────
function TableCard({
  table,
  onPress,
  onLongPress,
  accentColor,
}: {
  table: UserTable;
  onPress: () => void;
  onLongPress: () => void;
  accentColor: string;
}) {
  return (
    <TouchableOpacity style={dc.card} onPress={onPress} onLongPress={onLongPress} delayLongPress={500} activeOpacity={0.75}>
      <View style={dc.preview}>
        <TableThumbnail table={table} accentColor={accentColor} />
      </View>
      <Text style={dc.name} numberOfLines={2}>{table.name}</Text>
      <Text style={dc.meta}>{table.rows.length} rig · {table.columns.length} col</Text>
    </TouchableOpacity>
  );
}
const CARD_W = (SCREEN_W - 32 - 12) / 2;
const dc = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  preview: {
    backgroundColor: '#1C1C1E',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  meta: {
    color: '#8E8E93',
    fontSize: 11,
    paddingHorizontal: 10,
    paddingBottom: 10,
    marginTop: 2,
  },
});

// ─── Create-table modal ──────────────────────────────────────────────────────
const ACCENT_COLORS = [
  '#0A84FF', '#30D158', '#FF9F0A', '#FF375F',
  '#BF5AF2', '#5E5CE6', '#64D2FF', '#FF6961',
];

function CreateTableModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, columns: string[], color: string) => void;
}) {
  const [name, setName] = useState('');
  const [colInput, setColInput] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [accent, setAccent] = useState(ACCENT_COLORS[0]);
  const inputRef = useRef<TextInput>(null);

  const reset = () => { setName(''); setColInput(''); setColumns([]); setAccent(ACCENT_COLORS[0]); };
  const handleClose = () => { reset(); onClose(); };

  const addCol = () => {
    const t = colInput.trim();
    if (!t || columns.includes(t)) return;
    setColumns(p => [...p, t]);
    setColInput('');
    inputRef.current?.focus();
  };

  const canCreate = name.trim().length > 0 && columns.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={cm.backdrop}>
          <View style={cm.sheet}>

            {/* drag handle */}
            <View style={cm.handle} />

            <View style={cm.headerRow}>
              <TouchableOpacity onPress={handleClose}><Text style={cm.cancel}>Annulla</Text></TouchableOpacity>
              <Text style={cm.title}>Nuova tabella</Text>
              <TouchableOpacity onPress={() => { if (canCreate) { onCreate(name.trim(), columns, accent); reset(); onClose(); } }} disabled={!canCreate}>
                <Text style={[cm.done, !canCreate && { opacity: 0.35 }]}>Crea</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>

              {/* name */}
              <View style={cm.section}>
                <Text style={cm.sectionLabel}>NOME</Text>
                <TextInput
                  style={cm.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Es. Budget mensile"
                  placeholderTextColor={C.textMuted}
                  maxLength={60}
                  autoFocus
                />
              </View>

              {/* accent color */}
              <View style={cm.section}>
                <Text style={cm.sectionLabel}>COLORE</Text>
                <View style={cm.colorsRow}>
                  {ACCENT_COLORS.map(c => (
                    <TouchableOpacity key={c} onPress={() => setAccent(c)}>
                      <View style={[cm.swatch, { backgroundColor: c }, accent === c && cm.swatchSel]} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* columns */}
              <View style={cm.section}>
                <Text style={cm.sectionLabel}>COLONNE</Text>
                <View style={cm.colInputRow}>
                  <TextInput
                    ref={inputRef}
                    style={[cm.input, { flex: 1 }]}
                    value={colInput}
                    onChangeText={setColInput}
                    placeholder="Nome colonna"
                    placeholderTextColor={C.textMuted}
                    onSubmitEditing={addCol}
                    returnKeyType="done"
                    blurOnSubmit={false}
                    maxLength={40}
                  />
                  <TouchableOpacity
                    style={[cm.addBtn, { backgroundColor: accent }, !colInput.trim() && { opacity: 0.35 }]}
                    onPress={addCol}
                    disabled={!colInput.trim()}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
                {columns.length > 0 && (
                  <View style={cm.colsList}>
                    {columns.map((col, i) => (
                      <View key={i} style={cm.colRow}>
                        <Text style={cm.colNum}>{i + 1}</Text>
                        <Text style={cm.colName}>{col}</Text>
                        <TouchableOpacity onPress={() => setColumns(p => p.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="remove-circle" size={20} color="#FF375F" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {columns.length === 0 && (
                  <Text style={cm.hint}>Aggiungi almeno una colonna</Text>
                )}
              </View>

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cm = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingHorizontal: 16, maxHeight: '88%' },
  handle:      { width: 36, height: 5, borderRadius: 3, backgroundColor: '#48484A', alignSelf: 'center', marginBottom: 8 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  title:       { color: C.textPrimary, fontSize: 17, fontWeight: '600' },
  cancel:      { color: C.textMuted, fontSize: 17 },
  done:        { color: C.accent, fontSize: 17, fontWeight: '600' },
  section:     { marginTop: 20 },
  sectionLabel:{ color: C.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  input:       { backgroundColor: '#2C2C2E', color: C.textPrimary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#48484A' },
  colorsRow:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  swatch:      { width: 32, height: 32, borderRadius: 16 },
  swatchSel:   { borderWidth: 2.5, borderColor: '#fff' },
  colInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  addBtn:      { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colsList:    { marginTop: 8, borderRadius: 10, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#48484A' },
  colRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C2C2E', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#48484A' },
  colNum:      { color: C.textMuted, fontSize: 13, width: 24 },
  colName:     { color: C.textPrimary, fontSize: 15, flex: 1 },
  hint:        { color: C.textMuted, fontSize: 13, marginTop: 8 },
});

// ─── Full spreadsheet view ───────────────────────────────────────────────────
type CellId = { row: number; col: number } | null;

function SpreadsheetView({
  table,
  accentColor,
  onUpdate,
  onClose,
}: {
  table: UserTable;
  accentColor: string;
  onUpdate: (rows: UserTable['rows']) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<UserTable['rows']>(table.rows);
  const [selected, setSelected] = useState<CellId>(null);
  const [editing, setEditing] = useState<CellId>(null);
  const [editValue, setEditValue] = useState('');
  const [addColInput, setAddColInput] = useState('');
  const [showAddCol, setShowAddCol] = useState(false);
  const [columns, setColumns] = useState(table.columns);

  const commitEdit = () => {
    if (!editing) { setEditing(null); return; }
    const { row, col } = editing;
    const colName = columns[col];
    const next = rows.map((r, i) => i === row ? { ...r, [colName]: editValue } : r);
    setRows(next);
    onUpdate(next);
    setEditing(null);
    setSelected({ row, col });
  };

  const startEdit = (row: number, col: number) => {
    const colName = columns[col];
    setEditValue(rows[row]?.[colName] ?? '');
    setEditing({ row, col });
    setSelected({ row, col });
  };

  const addRow = () => {
    const empty: Record<string, string> = {};
    columns.forEach(c => { empty[c] = ''; });
    const next = [...rows, empty];
    setRows(next);
    onUpdate(next);
  };

  const deleteRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    onUpdate(next);
    setSelected(null);
  };

  const addColumn = () => {
    const name = addColInput.trim();
    if (!name || columns.includes(name)) return;
    const nextCols = [...columns, name];
    setColumns(nextCols);
    setAddColInput('');
    setShowAddCol(false);
    // also update rows to have the new column key
    const nextRows = rows.map(r => ({ ...r, [name]: '' }));
    setRows(nextRows);
    onUpdate(nextRows);
  };

  const isSelected = (r: number, c: number) => selected?.row === r && selected?.col === c;
  const isEditing  = (r: number, c: number) => editing?.row  === r && editing?.col  === c;

  const totalW = IDX_W + columns.length * COL_W + COL_W; // extra COL_W for "+" col

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={sv.container}>

        {/* ── Top bar ── */}
        <View style={sv.topBar}>
          <TouchableOpacity onPress={onClose} style={sv.topBtn}>
            <Ionicons name="chevron-back" size={22} color={accentColor} />
            <Text style={[sv.topBtnText, { color: accentColor }]}>Tabelle</Text>
          </TouchableOpacity>
          <Text style={sv.topTitle} numberOfLines={1}>{table.name}</Text>
          <TouchableOpacity
            style={sv.topBtn}
            onPress={() => Alert.alert('Elimina riga', 'Eliminare la riga selezionata?', [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Elimina', style: 'destructive', onPress: () => { if (selected) deleteRow(selected.row); } },
            ])}
            disabled={selected === null}
          >
            <Ionicons name="trash-outline" size={20} color={selected ? '#FF375F' : '#48484A'} />
          </TouchableOpacity>
        </View>

        {/* ── Formula bar ── */}
        {editing ? (
          <View style={sv.formulaBar}>
            <Text style={sv.formulaRef}>{String.fromCharCode(65 + editing.col)}{editing.row + 1}</Text>
            <TextInput
              style={sv.formulaInput}
              value={editValue}
              onChangeText={setEditValue}
              onSubmitEditing={commitEdit}
              returnKeyType="done"
              autoFocus
              selectTextOnFocus
              placeholderTextColor={C.textMuted}
            />
            <TouchableOpacity onPress={() => { setEditing(null); }} style={sv.formulaBtn}>
              <Ionicons name="close" size={18} color="#FF375F" />
            </TouchableOpacity>
            <TouchableOpacity onPress={commitEdit} style={sv.formulaBtn}>
              <Ionicons name="checkmark" size={18} color="#30D158" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={sv.formulaBar}>
            <Text style={sv.formulaRef}>{selected ? `${String.fromCharCode(65 + selected.col)}${selected.row + 1}` : ''}</Text>
            <Text style={sv.formulaStatic} numberOfLines={1}>
              {selected ? (rows[selected.row]?.[columns[selected.col]] ?? '') : ''}
            </Text>
          </View>
        )}

        {/* ── Grid ── */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ width: totalW }}>

              {/* Column header row */}
              <View style={sv.row}>
                {/* corner cell */}
                <View style={[sv.idxCell, sv.headerCell, { borderBottomColor: accentColor, borderBottomWidth: 2 }]} />
                {columns.map((col, ci) => (
                  <View key={ci} style={[sv.colHeader, { borderBottomColor: accentColor, borderBottomWidth: 2 }]}>
                    <Text style={sv.colHeaderLetter}>{String.fromCharCode(65 + ci)}</Text>
                    <Text style={sv.colHeaderName} numberOfLines={1}>{col}</Text>
                  </View>
                ))}
                {/* Add column button */}
                <TouchableOpacity style={[sv.colHeader, sv.addColBtn, { borderBottomColor: accentColor, borderBottomWidth: 2 }]} onPress={() => setShowAddCol(true)}>
                  <Ionicons name="add" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Body rows */}
              {rows.length === 0 ? (
                <View style={[sv.row, { backgroundColor: C.bodyCell }]}>
                  <View style={[sv.idxCell, { backgroundColor: C.headerCell }]}>
                    <Text style={sv.idxText}>1</Text>
                  </View>
                  {columns.map((_, ci) => (
                    <View key={ci} style={sv.cell} />
                  ))}
                  <View style={sv.addRowColCell} />
                </View>
              ) : (
                rows.map((row, ri) => (
                  <View key={ri} style={[sv.row, ri % 2 === 1 && { backgroundColor: C.bodyCell }]}>
                    {/* row index */}
                    <View style={[sv.idxCell, { backgroundColor: C.headerCell }]}>
                      <Text style={sv.idxText}>{ri + 1}</Text>
                    </View>
                    {/* cells */}
                    {columns.map((col, ci) => {
                      const sel = isSelected(ri, ci);
                      const edit = isEditing(ri, ci);
                      return (
                        <Pressable
                          key={ci}
                          style={[sv.cell, sel && sv.cellSelected]}
                          onPress={() => { if (sel) { startEdit(ri, ci); } else { setSelected({ row: ri, col: ci }); setEditing(null); } }}
                          onLongPress={() => startEdit(ri, ci)}
                        >
                          {edit ? (
                            <TextInput
                              style={sv.cellInput}
                              value={editValue}
                              onChangeText={setEditValue}
                              onSubmitEditing={commitEdit}
                              onBlur={commitEdit}
                              autoFocus
                              returnKeyType="done"
                            />
                          ) : (
                            <Text style={[sv.cellText, sel && { color: '#fff', fontWeight: '500' }]} numberOfLines={1}>
                              {row[col] ?? ''}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                    <View style={sv.addRowColCell} />
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </ScrollView>

        {/* ── Bottom toolbar ── */}
        <View style={sv.bottomBar}>
          <TouchableOpacity style={sv.bottomBtn} onPress={addRow}>
            <Ionicons name="add" size={20} color={accentColor} />
            <Text style={[sv.bottomBtnText, { color: accentColor }]}>Riga</Text>
          </TouchableOpacity>
          <View style={sv.bottomSep} />
          <TouchableOpacity style={sv.bottomBtn} onPress={() => setShowAddCol(true)}>
            <Ionicons name="add" size={20} color={accentColor} />
            <Text style={[sv.bottomBtnText, { color: accentColor }]}>Colonna</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Add column modal */}
      <Modal visible={showAddCol} transparent animationType="fade" onRequestClose={() => setShowAddCol(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={sv.addColBackdrop}>
            <View style={sv.addColCard}>
              <Text style={sv.addColTitle}>Nuova colonna</Text>
              <TextInput
                style={sv.addColInput}
                value={addColInput}
                onChangeText={setAddColInput}
                placeholder="Nome colonna"
                placeholderTextColor={C.textMuted}
                autoFocus
                onSubmitEditing={addColumn}
                returnKeyType="done"
              />
              <View style={sv.addColActions}>
                <TouchableOpacity style={sv.addColCancel} onPress={() => { setShowAddCol(false); setAddColInput(''); }}>
                  <Text style={sv.addColCancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sv.addColConfirm, { backgroundColor: accentColor }, !addColInput.trim() && { opacity: 0.4 }]}
                  onPress={addColumn}
                  disabled={!addColInput.trim()}
                >
                  <Text style={sv.addColConfirmText}>Aggiungi</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
}

const sv = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.canvas },
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 10, backgroundColor: '#2C2C2E', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine },
  topBtn:       { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  topBtnText:   { fontSize: 17 },
  topTitle:     { color: C.textPrimary, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  formulaBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#252528', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, gap: 8, minHeight: 40 },
  formulaRef:   { color: C.textMuted, fontSize: 13, fontWeight: '600', minWidth: 30 },
  formulaInput: { flex: 1, color: C.textPrimary, fontSize: 14, padding: 0 },
  formulaStatic:{ flex: 1, color: C.textSecondary, fontSize: 14 },
  formulaBtn:   { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  row:          { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gridLine, backgroundColor: C.bodyAlt },
  idxCell:      { width: IDX_W, height: ROW_H, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine },
  idxText:      { color: C.textMuted, fontSize: 12, fontWeight: '500' },
  headerCell:   { backgroundColor: C.headerCell },
  colHeader:    { width: COL_W, height: ROW_H, backgroundColor: C.headerCell, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, paddingHorizontal: 6 },
  colHeaderLetter: { color: C.textMuted, fontSize: 10, fontWeight: '500' },
  colHeaderName:   { color: C.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  addColBtn:    { backgroundColor: C.headerCell },
  cell:         { width: COL_W, height: ROW_H, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.gridLine, paddingHorizontal: 8, justifyContent: 'center' },
  cellSelected: { backgroundColor: '#0A84FF18', borderWidth: 1.5, borderColor: '#0A84FF' },
  cellText:     { color: C.textSecondary, fontSize: 13 },
  cellInput:    { color: C.textPrimary, fontSize: 13, padding: 0, flex: 1 },
  addRowColCell:{ width: COL_W, height: ROW_H },

  bottomBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C2C2E', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.gridLine, paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
  bottomBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  bottomBtnText:{ fontSize: 14, fontWeight: '500' },
  bottomSep:    { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: C.gridLine },

  addColBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  addColCard:     { backgroundColor: '#2C2C2E', borderRadius: 14, padding: 20, width: '100%' },
  addColTitle:    { color: C.textPrimary, fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  addColInput:    { backgroundColor: '#1C1C1E', color: C.textPrimary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#48484A' },
  addColActions:  { flexDirection: 'row', gap: 12, marginTop: 16 },
  addColCancel:   { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: '#3A3A3C', alignItems: 'center' },
  addColCancelText: { color: C.textPrimary, fontSize: 15, fontWeight: '500' },
  addColConfirm:  { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  addColConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

// ─── Main view ────────────────────────────────────────────────────────────────
export default function TabelleView() {
  const { tables, addTable, updateTable, deleteTable } = useHabits();
  const [showCreate, setShowCreate] = useState(false);
  const [openTable, setOpenTable] = useState<UserTable | null>(null);

  const getAccent = (t: UserTable) => t.color || ACCENT_COLORS[0];

  const handleDelete = (t: UserTable) =>
    Alert.alert('Elimina tabella', `Eliminare "${t.name}"?`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: () => deleteTable(t.id) },
    ]);

  return (
    <View style={mv.container}>
      {/* toolbar */}
      <View style={mv.toolbar}>
        <Text style={mv.toolbarTitle}>{tables.length > 0 ? `${tables.length} tabella${tables.length !== 1 ? 'e' : ''}` : ''}</Text>
        <TouchableOpacity style={mv.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={22} color={C.accent} />
        </TouchableOpacity>
      </View>

      {tables.length === 0 ? (
        <View style={mv.empty}>
          <View style={mv.emptyIcon}>
            <Ionicons name="grid-outline" size={44} color="#48484A" />
          </View>
          <Text style={mv.emptyTitle}>Nessuna tabella</Text>
          <Text style={mv.emptyHint}>Tocca + per creare la tua prima tabella</Text>
          <TouchableOpacity style={mv.emptyBtn} onPress={() => setShowCreate(true)}>
            <Text style={mv.emptyBtnText}>Crea tabella</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={mv.grid}>
          {tables.map(t => (
            <TableCard
              key={t.id}
              table={t}
              accentColor={getAccent(t)}
              onPress={() => setOpenTable(t)}
              onLongPress={() => handleDelete(t)}
            />
          ))}
        </ScrollView>
      )}

      <CreateTableModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(name, cols, color) => addTable(name, cols, color)}
      />

      {openTable && (
        <SpreadsheetView
          table={openTable}
          accentColor={getAccent(openTable)}
          onUpdate={(rows) => {
            updateTable(openTable.id, { rows });
            setOpenTable(prev => prev ? { ...prev, rows } : null);
          }}
          onClose={() => setOpenTable(null)}
        />
      )}
    </View>
  );
}

const mv = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.canvas },
  toolbar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 6 },
  toolbarTitle: { color: C.textMuted, fontSize: 13 },
  addBtn:    { padding: 4 },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { color: C.textPrimary, fontSize: 20, fontWeight: '700' },
  emptyHint:  { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn:   { marginTop: 12, backgroundColor: C.accent, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 120 },
});
