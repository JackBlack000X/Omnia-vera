import { COLORS } from '@/components/modal/modalStyles';
import { useHabits } from '@/lib/habits/Provider';
import type { TrackerEntry } from '@/lib/habits/schema';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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

const TZ = 'Europe/Zurich';

function getNowYmd(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function getNowHhmm(): string {
  try {
    const parts = new Intl.DateTimeFormat('it-IT', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find(p => p.type === 'hour')?.value ?? '00';
    const m = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `${h}:${m}`;
  } catch {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function roundToFive(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const rounded = Math.round((h * 60 + m) / 5) * 5;
  const rh = Math.floor(rounded / 60) % 24;
  const rm = rounded % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

function addMinutes(hhmm: string, delta: number, maxMinutes = 1439): string {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + delta;
  total = Math.max(0, Math.min(maxMinutes, total));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatExtendedTime(hhmm: string): { display: string; nextDay: boolean } {
  const [h, m] = hhmm.split(':').map(Number);
  if (h >= 24) {
    return { display: `${String(h - 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`, nextDay: true };
  }
  return { display: hhmm, nextDay: false };
}

function parseYmdDisplay(ymd: string): string {
  try {
    const d = new Date(ymd + 'T12:00:00.000Z');
    return new Intl.DateTimeFormat('it-IT', {
      timeZone: TZ,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return ymd;
  }
}

function StarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <View style={s.starRow}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(star => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}>
          <Ionicons
            name={value !== null && star <= value ? 'star' : 'star-outline'}
            size={22}
            color={value !== null && star <= value ? '#FFD700' : '#555'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const HOLD_DELAY_MS = 350;
const HOLD_INTERVAL_MS = 60;

function HoldableStepBtn({ delta, value, onChange, maxMinutes = 1439, children }: { delta: number; value: string; onChange: (v: string) => void; maxMinutes?: number; children: React.ReactNode }) {
  const onPressRef = React.useRef(onChange);
  const valueRef = React.useRef(value);
  const holdTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => { onPressRef.current = onChange; }, [onChange]);
  React.useEffect(() => { valueRef.current = value; }, [value]);

  const clear = () => {
    if (holdTimeout.current) { clearTimeout(holdTimeout.current); holdTimeout.current = null; }
    if (holdInterval.current) { clearInterval(holdInterval.current); holdInterval.current = null; }
  };

  React.useEffect(() => clear, []);

  const handlePressIn = () => {
    clear();
    onPressRef.current(addMinutes(valueRef.current, delta, maxMinutes));
    holdTimeout.current = setTimeout(() => {
      holdInterval.current = setInterval(() => {
        onPressRef.current(addMinutes(valueRef.current, delta, maxMinutes));
      }, HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  return (
    <Pressable
      style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.7 }]}
      onPress={() => {}}
      onPressIn={handlePressIn}
      onPressOut={clear}
      onResponderTerminate={clear}
    >
      <Text style={s.stepBtnText}>{children}</Text>
    </Pressable>
  );
}

function TimeControl({
  label,
  value,
  onChange,
  maxMinutes = 1439,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxMinutes?: number;
}) {
  const { display, nextDay } = formatExtendedTime(value);
  return (
    <View style={s.timeControl}>
      <Text style={s.timeControlLabel}>{label}</Text>
      <View style={s.timeStepperRow}>
        <HoldableStepBtn delta={-5} value={value} onChange={onChange} maxMinutes={maxMinutes}>−</HoldableStepBtn>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.timeValue}>{display}</Text>
          {nextDay && <Text style={s.nextDayLabel}>+1d</Text>}
        </View>
        <HoldableStepBtn delta={5} value={value} onChange={onChange} maxMinutes={maxMinutes}>+</HoldableStepBtn>
      </View>
    </View>
  );
}

function HoldableDateBtn({ onStep, disabled, children }: { onStep: () => void; disabled?: boolean; children: React.ReactNode }) {
  const onStepRef = React.useRef(onStep);
  const holdTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => { onStepRef.current = onStep; }, [onStep]);

  const clear = () => {
    if (holdTimeout.current) { clearTimeout(holdTimeout.current); holdTimeout.current = null; }
    if (holdInterval.current) { clearInterval(holdInterval.current); holdInterval.current = null; }
  };

  React.useEffect(() => clear, []);

  const handlePressIn = () => {
    if (disabled) return;
    onStepRef.current();
    holdTimeout.current = setTimeout(() => {
      holdInterval.current = setInterval(() => onStepRef.current(), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  return (
    <Pressable
      style={({ pressed }) => [s.stepBtn, disabled && { opacity: 0.3 }, pressed && !disabled && { opacity: 0.7 }]}
      onPress={() => {}}
      onPressIn={handlePressIn}
      onPressOut={clear}
      onResponderTerminate={clear}
      disabled={disabled}
    >
      <Text style={s.stepBtnText}>{children}</Text>
    </Pressable>
  );
}

function DateControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const valueRef = React.useRef(value);
  React.useEffect(() => { valueRef.current = value; }, [value]);

  const subtractDay = () => {
    const d = new Date(valueRef.current + 'T12:00:00.000Z');
    d.setUTCDate(d.getUTCDate() - 1);
    onChange(d.toISOString().slice(0, 10));
  };
  const addDay = () => {
    const d = new Date(valueRef.current + 'T12:00:00.000Z');
    const next = new Date(d);
    next.setUTCDate(d.getUTCDate() + 1);
    const todayYmd = getNowYmd();
    if (next.toISOString().slice(0, 10) <= todayYmd) {
      onChange(next.toISOString().slice(0, 10));
    }
  };
  const todayYmd = getNowYmd();
  const isToday = value === todayYmd;

  return (
    <View style={s.dateControl}>
      <HoldableDateBtn onStep={subtractDay}>‹</HoldableDateBtn>
      <Text style={s.dateValue}>{parseYmdDisplay(value)}</Text>
      <HoldableDateBtn onStep={addDay} disabled={isToday}>›</HoldableDateBtn>
    </View>
  );
}

type Props = {
  visible: boolean;
  initialDate?: string;
  editEntry?: TrackerEntry | null;
  onClose: () => void;
};

export default function TrackerModal({ visible, initialDate, editEntry, onClose }: Props) {
  const { addTrackerEntry, updateTrackerEntry, deleteTrackerEntry, savedTrackerPeople } = useHabits();

  const nowYmd = getNowYmd();
  const nowHhmm = roundToFive(getNowHhmm());

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(nowYmd);
  const [startTime, setStartTime] = useState(addMinutes(nowHhmm, -60));
  const [endTime, setEndTime] = useState(nowHhmm);
  const [color, setColor] = useState('#8b5cf6');
  const [withPeople, setWithPeople] = useState<string[]>([]);
  const [personInput, setPersonInput] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [showPeopleSuggestions, setShowPeopleSuggestions] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editEntry) {
      setTitle(editEntry.title);
      setDate(editEntry.date);
      setStartTime(editEntry.startTime);
      setEndTime(editEntry.endTime);
      setColor(editEntry.color);
      setWithPeople(editEntry.withPeople ?? []);
      setRating(editEntry.rating ?? null);
      setComment(editEntry.comment ?? '');
    } else {
      const now = roundToFive(getNowHhmm());
      setTitle('');
      setDate(getNowYmd());
      setStartTime(addMinutes(now, -60));
      setEndTime(now);
      setColor('#8b5cf6');
      setWithPeople([]);
      setRating(null);
      setComment('');
    }
    setPersonInput('');
    setShowPeopleSuggestions(false);
  }, [visible, editEntry, initialDate]);

  const filteredPeople = savedTrackerPeople.filter(
    p => p.toLowerCase().includes(personInput.toLowerCase()) && !withPeople.includes(p)
  );

  const addPerson = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || withPeople.includes(trimmed)) return;
    setWithPeople(prev => [...prev, trimmed]);
    setPersonInput('');
    setShowPeopleSuggestions(false);
  };

  const removePerson = (name: string) => {
    setWithPeople(prev => prev.filter(p => p !== name));
  };

  const handleSave = () => {
    if (!title.trim()) return;
    if (startTime >= endTime) return;

    const entry = {
      title: title.trim(),
      date,
      startTime,
      endTime,
      color,
      withPeople: withPeople.length > 0 ? withPeople : undefined,
      rating: rating ?? null,
      comment: comment.trim() || null,
    };

    if (editEntry) {
      updateTrackerEntry(editEntry.id, entry);
    } else {
      addTrackerEntry(entry);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editEntry) return;
    Alert.alert('Elimina', 'Eliminare questa voce?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          deleteTrackerEntry(editEntry.id);
          onClose();
        },
      },
    ]);
  };

  const titleInvalid = !title.trim();
  const timeInvalid = startTime >= endTime;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.backdrop}>
          <View style={s.card}>
            <View style={s.headerRow}>
              <Text style={s.cardTitle}>{editEntry ? 'Modifica Tracker' : 'Nuovo Tracker'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Nome attività (es. Studio)"
                placeholderTextColor="#555"
                maxLength={80}
              />

              <View style={s.section}>
                <Text style={s.sectionLabel}>Giorno</Text>
                <DateControl value={date} onChange={setDate} />
              </View>

              <View style={s.section}>
                <Text style={s.sectionLabel}>Orario</Text>
                <View style={s.timeRow}>
                  <TimeControl label="Inizio" value={startTime} onChange={setStartTime} />
                  <View style={s.timeSep}>
                    <Text style={s.timeSepText}>→</Text>
                  </View>
                  <TimeControl label="Fine" value={endTime} onChange={setEndTime} maxMinutes={2879} />
                </View>
                {timeInvalid && (
                  <Text style={s.errorText}>L&apos;ora di fine deve essere dopo l&apos;inizio</Text>
                )}
              </View>

              <View style={s.section}>
                <Text style={s.sectionLabel}>Colore</Text>
                <View style={s.colorsRow}>
                  {COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        s.colorSwatch,
                        { backgroundColor: c },
                        color === c && s.colorSwatchSelected,
                      ]}
                      onPress={() => setColor(c)}
                    />
                  ))}
                </View>
              </View>

              <View style={s.section}>
                <Text style={s.sectionLabel}>Con chi</Text>
                <View style={s.peopleChips}>
                  {withPeople.map(p => (
                    <TouchableOpacity key={p} style={s.personChip} onPress={() => removePerson(p)}>
                      <Text style={s.personChipText}>{p}</Text>
                      <Ionicons name="close-circle" size={14} color="#ccc" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.personInputRow}>
                  <TextInput
                    style={[s.input, { flex: 1, marginTop: 0 }]}
                    value={personInput}
                    onChangeText={v => {
                      setPersonInput(v);
                      setShowPeopleSuggestions(true);
                    }}
                    onFocus={() => setShowPeopleSuggestions(true)}
                    placeholder="Aggiungi persona"
                    placeholderTextColor="#555"
                    onSubmitEditing={() => addPerson(personInput)}
                    returnKeyType="done"
                  />
                  {personInput.trim().length > 0 && (
                    <TouchableOpacity style={s.addPersonBtn} onPress={() => addPerson(personInput)}>
                      <Ionicons name="add" size={22} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
                {showPeopleSuggestions && filteredPeople.length > 0 && (
                  <View style={s.suggestions}>
                    {filteredPeople.map(p => (
                      <TouchableOpacity key={p} style={s.suggestionItem} onPress={() => addPerson(p)}>
                        <Text style={s.suggestionText}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={s.section}>
                <Text style={s.sectionLabel}>Valutazione</Text>
                <StarRating value={rating} onChange={v => setRating(prev => prev === v ? null : v)} />
              </View>

              <View style={s.section}>
                <Text style={s.sectionLabel}>Note (opzionale)</Text>
                <TextInput
                  style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Aggiungi una nota..."
                  placeholderTextColor="#555"
                  multiline
                />
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={s.footer}>
              {editEntry && (
                <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color="#ff4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.saveBtn, (titleInvalid || timeInvalid) && { opacity: 0.4 }]}
                onPress={handleSave}
                disabled={titleInvalid || timeInvalid}
              >
                <Text style={s.saveBtnText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  section: {
    marginTop: 18,
  },
  sectionLabel: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  dateValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeControl: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  timeControlLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  timeStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 44,
    textAlign: 'center',
  },
  nextDayLabel: {
    color: '#8b5cf6',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 1,
  },
  timeSep: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSepText: {
    color: '#6b7280',
    fontSize: 18,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  colorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#fff',
    transform: [{ scale: 1.15 }],
  },
  peopleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  personChipText: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  personInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addPersonBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  suggestions: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  suggestionText: {
    color: '#e5e7eb',
    fontSize: 14,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2d1515',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
