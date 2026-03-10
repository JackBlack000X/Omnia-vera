import { useColorScheme } from '@/hooks/use-color-scheme';
import { ConfirmationModal } from '@/components/modal/ConfirmationModal';
import { styles, COLORS } from '@/components/modal/modalStyles';
import { useModalLogic } from '@/lib/modal/useModalLogic';
import { formatDuration } from '@/lib/modal/helpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { loadPlaces } from '@/lib/places';
import { searchCities, type CityInfo } from '@/lib/weather';
import { canAskLocationPermission, getLocationPermissionStatusAsync, type LocationPermissionStatus } from '@/lib/location';
import React, { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type HoldableStepperButtonProps = {
  onPress: () => void;
  children: React.ReactNode;
};

const HOLD_DELAY_MS = 350;
const HOLD_INTERVAL_MS = 60;

function HoldableStepperButton({ onPress, children }: HoldableStepperButtonProps) {
  const onPressRef = useRef(onPress);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const clearTimers = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handlePressIn = () => {
    onPressRef.current();
    holdTimeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => onPressRef.current(), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  const handlePressOut = () => {
    clearTimers();
  };

  useEffect(() => clearTimers, []);

  return (
    <Pressable
      style={({ pressed }) => [styles.timeStepper, pressed && { opacity: 0.85 }]}
      onPress={() => {}}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onResponderTerminate={handlePressOut}
    >
      <Text style={styles.timeStepperText}>{children}</Text>
    </Pressable>
  );
}

function parseYmdSafe(ymd: string): { year: number; month: number; day: number } {
  const parts = ymd.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map(n => Number(n));
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      return { year: y, month: Math.min(Math.max(m, 1), 12), day: Math.min(Math.max(d, 1), 31) };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function formatYmd(year: number, month: number, day: number): string {
  const m = Math.min(Math.max(month, 1), 12);
  const d = Math.min(Math.max(day, 1), 31);
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function clampYmdNotBefore(min: Date, year: number, month: number, day: number): { year: number; month: number; day: number } {
  const candidate = new Date(year, month - 1, day);
  const minStart = new Date(min.getFullYear(), min.getMonth(), min.getDate());
  if (candidate < minStart) {
    return {
      year: minStart.getFullYear(),
      month: minStart.getMonth() + 1,
      day: minStart.getDate(),
    };
  }
  return { year, month, day };
}

function hhmmToMinutesSafe(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parts = value.split(':');
  if (parts.length !== 2) return fallback;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return Math.max(0, Math.min(24 * 60 - 1, h * 60 + m));
}

function minutesToHhmmSafe(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Modal multipurpose: type=new|rename|schedule|color
export default function ModalScreen() {
  const { type = 'new', id, folder } = useLocalSearchParams<{ type?: string; id?: string; folder?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const m = useModalLogic({ type, id, folder, scrollRef });
  const [places, setPlaces] = React.useState<{ id: string; name: string }[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = React.useState<string | null>(m.locationRule?.placeId ?? null);
  const [locationStatus, setLocationStatus] = React.useState<LocationPermissionStatus>('none');

  const [fromQuery, setFromQuery] = React.useState('');
  const [fromResults, setFromResults] = React.useState<CityInfo[]>([]);
  const [fromSearching, setFromSearching] = React.useState(false);

  const [toQuery, setToQuery] = React.useState('');
  const [toResults, setToResults] = React.useState<CityInfo[]>([]);
  const [toSearching, setToSearching] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const loaded = await loadPlaces();
      setPlaces(loaded.map(p => ({ id: p.id, name: p.name })));
      if (m.locationRule?.placeId) {
        setSelectedPlaceId(m.locationRule.placeId);
      }
      if (canAskLocationPermission()) {
        const status = await getLocationPermissionStatusAsync();
        setLocationStatus(status);
      }
    })();
  }, [m.locationRule?.placeId]);

  React.useEffect(() => {
    if (fromQuery.trim().length < 2) {
      setFromResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setFromSearching(true);
      const results = await searchCities(fromQuery);
      setFromResults(results);
      setFromSearching(false);
    }, 400);
    return () => clearTimeout(timeout);
  }, [fromQuery]);

  React.useEffect(() => {
    if (toQuery.trim().length < 2) {
      setToResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setToSearching(true);
      const results = await searchCities(toQuery);
      setToResults(results);
      setToSearching(false);
    }, 400);
    return () => clearTimeout(timeout);
  }, [toQuery]);

  // Vincolo orario: la partenza del ritorno non può essere prima dell'arrivo andata
  // nei casi in cui il ritorno è lo stesso giorno o il giorno subito dopo un arrivo "giorno dopo".
  // Foto 2: se stesso giorno e arrivo 23:55 → earliestReturnMin >= 24*60: invece di "giorno dopo",
  //   avanza automaticamente giorno ritorno al giorno successivo e imposta 00:00 / 00:05.
  // Foto 3: se arrivo andata "giorno dopo" 00:55 e ritorno è il 10 marzo, partenza min 01:00, arrivo min 01:05.
  React.useEffect(() => {
    if (!m.travelGiornoRitorno) return;

    const partenzaDate = parseYmdSafe(m.travelGiornoPartenza);
    const ritornoDate = parseYmdSafe(m.travelGiornoRitorno);
    const dStart = new Date(partenzaDate.year, partenzaDate.month - 1, partenzaDate.day);
    const dRet = new Date(ritornoDate.year, ritornoDate.month - 1, ritornoDate.day);
    const dayDiff = Math.round((dRet.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));

    const sameDayReturn =
      dayDiff === 0 &&
      !m.travelArrivoGiornoDopo &&
      !m.travelArrivoRitornoGiornoDopo;

    const nextDayReturnAfterOvernight =
      dayDiff === 1 &&
      m.travelArrivoGiornoDopo &&
      !m.travelArrivoRitornoGiornoDopo;

    const departOutMin = hhmmToMinutesSafe(m.travelOrarioPartenza, 8 * 60);
    const arriveOutMin = hhmmToMinutesSafe(m.travelOrarioArrivo, departOutMin + 60);
    const earliestReturnMin = arriveOutMin + 5;

    // Foto 2: stesso giorno ma arrivo tardi (es. 23:55) → earliestReturnMin >= 24*60.
    // Invece di mostrare "Partenza (ritorno) (giorno dopo) 0:00", avanza giorno ritorno al 10 marzo
    // e imposta 00:00 / 00:05 senza "giorno dopo".
    if (sameDayReturn && earliestReturnMin >= 24 * 60) {
      const base = new Date(partenzaDate.year, partenzaDate.month - 1, partenzaDate.day);
      base.setDate(base.getDate() + 1);
      const nextY = base.getFullYear();
      const nextM = base.getMonth() + 1;
      const nextD = base.getDate();
      m.setTravelGiornoRitorno(formatYmd(nextY, nextM, nextD));
      m.setTravelOrarioPartenzaRitorno('00:00');
      m.setTravelPartenzaRitornoGiornoDopo(false);
      m.setTravelOrarioArrivoRitorno('00:05');
      m.setTravelArrivoRitornoGiornoDopo(false);
      return;
    }

    // Se arrivo andata è "giorno dopo" e c'è un giorno ritorno (anche oltre il giorno dopo),
    // partenza ritorno = arrivo andata (stesso orario), arrivo ritorno = +5.
    const returnDayAfterArrival = dayDiff >= 1 && m.travelArrivoGiornoDopo;
    if (returnDayAfterArrival) {
      // partenza ritorno = arrivo andata
      m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(arriveOutMin));
      m.setTravelPartenzaRitornoGiornoDopo(false);
      // arrivo ritorno = arrivo andata + 5
      const retArr = arriveOutMin + 5;
      if (retArr >= 24 * 60) {
        m.setTravelArrivoRitornoGiornoDopo(true);
        m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr - 24 * 60));
      } else {
        m.setTravelArrivoRitornoGiornoDopo(false);
        m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr));
      }
      return;
    }

    if (!sameDayReturn && !nextDayReturnAfterOvernight) return;

    // Stesso giorno o giorno dopo con arrivo overnight: spinge avanti partenza/arrivo ritorno.
    // Se supera 23:55 → avanza giorno ritorno e riparte da 00:00.
    const currentReturnDep = hhmmToMinutesSafe(m.travelOrarioPartenzaRitorno, 17 * 60);
    if (arriveOutMin >= currentReturnDep) {
      // Partenza ritorno = arrivo andata (stesso orario), arrivo ritorno = +5
      if (arriveOutMin >= 24 * 60) {
        const extraDays = Math.floor(arriveOutMin / (24 * 60));
        dRet.setDate(dRet.getDate() + extraDays);
        m.setTravelGiornoRitorno(formatYmd(dRet.getFullYear(), dRet.getMonth() + 1, dRet.getDate()));
        const wrapped = arriveOutMin - extraDays * 24 * 60;
        m.setTravelPartenzaRitornoGiornoDopo(false);
        m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(wrapped));
        const retArr = wrapped + 5;
        if (retArr >= 24 * 60) {
          m.setTravelArrivoRitornoGiornoDopo(true);
          m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr - 24 * 60));
        } else {
          m.setTravelArrivoRitornoGiornoDopo(false);
          m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr));
        }
      } else {
        m.setTravelPartenzaRitornoGiornoDopo(false);
        m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(arriveOutMin));
        const retArr = arriveOutMin + 5;
        if (retArr >= 24 * 60) {
          m.setTravelArrivoRitornoGiornoDopo(true);
          m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr - 24 * 60));
        } else {
          m.setTravelArrivoRitornoGiornoDopo(false);
          m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr));
        }
      }
    }
  }, [
    m.travelGiornoPartenza,
    m.travelGiornoRitorno,
    m.travelArrivoGiornoDopo,
    m.travelArrivoRitornoGiornoDopo,
    m.travelOrarioPartenza,
    m.travelOrarioArrivo,
    m.travelOrarioPartenzaRitorno,
  ]);

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
          <View style={styles.box}>
          <Text style={styles.title}>
            {type === 'new' ? 'Aggiungi' : type === 'rename' ? 'Rinomina Task' : type === 'schedule' ? 'Programma Abitudine' : type === 'edit' ? 'Modifica Task' : 'Scegli Colore'}
          </Text>

          {(type === 'new' || type === 'rename' || type === 'edit') && !(m.tipo === 'viaggio' && (type === 'new' || type === 'edit')) && (
            <TextInput
              value={m.text}
              onChangeText={(v) => v.length <= 100 && m.setText(v)}
              onSubmitEditing={m.save}
              placeholder="Nome"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>Tipo</Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                {(['task', 'abitudine', 'evento', 'viaggio'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => m.setTipo(t)}
                    style={[styles.chip, m.tipo === t ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                  >
                    <Text style={m.tipo === t ? styles.chipActiveText : styles.chipGhostText}>
                      {t === 'task'
                        ? 'Task'
                        : t === 'abitudine'
                        ? 'Abitudine'
                        : t === 'evento'
                        ? 'Evento'
                        : 'Viaggio'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>Cartella</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => m.setSelectedFolder(null)}
                  style={[styles.chip, m.selectedFolder === null ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={m.selectedFolder === null ? styles.chipActiveText : styles.chipGhostText}>Tutte</Text>
                </TouchableOpacity>
                {m.availableFolders.map(folderName => (
                  <TouchableOpacity
                    key={folderName}
                    onPress={() => m.setSelectedFolder(folderName)}
                    style={[styles.chip, m.selectedFolder === folderName ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                  >
                    <Text style={m.selectedFolder === folderName ? styles.chipActiveText : styles.chipGhostText}>{folderName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {type === 'edit' && m.existing?.createdAt && (
            <Text style={styles.createdAt}>
              creata il {m.existing.createdAt.split('-').reverse().join('/')}
            </Text>
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={styles.colorBottom}>
              <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                <Text style={styles.sectionTitle}>Colore</Text>
              </View>
              <View style={styles.colorSheet}>
                <View style={styles.colorsRowWrap}>
                  {COLORS.map(c => (
                    <TouchableOpacity key={c} onPress={() => m.setColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderColor: m.color === c ? (c === '#ffffff' ? '#00ff00' : '#ffffff') : 'transparent' }]} />
                  ))}
                </View>
              </View>
              {/* no duplicate schedule block here */}
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'task' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>Orario</Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                <TouchableOpacity
                  onPress={() => m.setTaskHasTime(false)}
                  style={[styles.chip, !m.taskHasTime ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={!m.taskHasTime ? styles.chipActiveText : styles.chipGhostText}>Nessun orario</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => m.setTaskHasTime(true)}
                  style={[styles.chip, m.taskHasTime ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={m.taskHasTime ? styles.chipActiveText : styles.chipGhostText}>Orario</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'viaggio' && (
            <View style={{ marginTop: 20 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Dettagli viaggio</Text>
              </View>

              <Text style={styles.subtle}>Mezzo</Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                {([
                  { key: 'aereo', label: 'Aereo', icon: 'airplane-outline' },
                  { key: 'treno', label: 'Treno', icon: 'train-outline' },
                  { key: 'auto', label: 'Auto', icon: 'car-outline' },
                  { key: 'nave', label: 'Nave', icon: 'boat-outline' },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => m.setTravelMezzo(opt.key)}
                    style={[styles.chip, m.travelMezzo === opt.key ? styles.chipActive : styles.chipGhost]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={16}
                      color={m.travelMezzo === opt.key ? '#fff' : '#9ca3af'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={m.travelMezzo === opt.key ? styles.chipActiveText : styles.chipGhostText}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={styles.subtle}>Partenza</Text>
                <View style={[styles.row, { marginTop: 8 }]}>
                  <TouchableOpacity
                    onPress={() => m.setTravelPartenzaTipo('attuale')}
                    style={[styles.chip, m.travelPartenzaTipo === 'attuale' ? styles.chipActive : styles.chipGhost]}
                  >
                    <Text style={m.travelPartenzaTipo === 'attuale' ? styles.chipActiveText : styles.chipGhostText}>
                      Posizione attuale
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => m.setTravelPartenzaTipo('personalizzata')}
                    style={[styles.chip, m.travelPartenzaTipo === 'personalizzata' ? styles.chipActive : styles.chipGhost]}
                  >
                    <Text
                      style={
                        m.travelPartenzaTipo === 'personalizzata'
                          ? styles.chipActiveText
                          : styles.chipGhostText
                      }
                    >
                      Altro luogo
                    </Text>
                  </TouchableOpacity>
                </View>
                {m.travelPartenzaTipo === 'personalizzata' && (
                  <View style={{ marginTop: 8 }}>
                    <TextInput
                      value={m.travelPartenzaNome}
                      onChangeText={(v) => {
                        m.setTravelPartenzaNome(v);
                        setFromQuery(v);
                      }}
                      placeholder="Cerca città di partenza..."
                      placeholderTextColor="#64748b"
                      style={styles.input}
                    />
                    {fromSearching && (
                      <Text style={[styles.subtle, { marginTop: 6 }]}>Cerco città…</Text>
                    )}
                    {fromResults.map((city, idx) => (
                      <TouchableOpacity
                        key={`${city.name}-${idx}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: '#0f172a',
                          marginTop: 4,
                        }}
                        onPress={() => {
                          m.setTravelPartenzaNome(city.name);
                          setFromQuery(city.name);
                          setFromResults([]);
                        }}
                      >
                        <Ionicons name="location-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#e5e7eb', fontSize: 14 }}>{city.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={styles.subtle}>Destinazione</Text>
                <TextInput
                  value={m.travelDestinazioneNome}
                  onChangeText={(v) => {
                    m.setTravelDestinazioneNome(v);
                    setToQuery(v);
                  }}
                  placeholder="Cerca città di arrivo..."
                  placeholderTextColor="#64748b"
                  style={[styles.input, { marginTop: 8 }]}
                />
                {toSearching && (
                  <Text style={[styles.subtle, { marginTop: 6 }]}>Cerco città…</Text>
                )}
                {toResults.map((city, idx) => (
                  <TouchableOpacity
                    key={`${city.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: '#0f172a',
                      marginTop: 4,
                    }}
                    onPress={() => {
                      m.setTravelDestinazioneNome(city.name);
                      setToQuery(city.name);
                      setToResults([]);
                    }}
                  >
                    <Ionicons name="location-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#e5e7eb', fontSize: 14 }}>{city.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(() => {
                const parsed = parseYmdSafe(m.travelGiornoPartenza);
                const today = new Date();
                const clamped = clampYmdNotBefore(today, parsed.year, parsed.month, parsed.day);
                const { year, month, day } = clamped;
                const isToday =
                  year === today.getFullYear() &&
                  month === today.getMonth() + 1 &&
                  day === today.getDate();

                const applyAndSet = (nextYear: number, nextMonth: number, nextDay: number) => {
                  const minDate = today;
                  const fixed = clampYmdNotBefore(minDate, nextYear, nextMonth, nextDay);
                  m.setTravelGiornoPartenza(formatYmd(fixed.year, fixed.month, fixed.day));
                };

                return (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.subtle}>Giorno partenza</Text>
                    <View
                      style={[
                        {
                          flexDirection: 'row',
                          gap: 12,
                          justifyContent: 'center',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          marginTop: 8,
                        },
                        isToday && {
                          borderWidth: 2,
                          borderColor: '#ff3b30',
                          borderRadius: 12,
                          paddingVertical: 8,
                          paddingHorizontal: 4,
                        },
                      ]}
                    >
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <HoldableStepperButton
                            onPress={() => {
                              const nextDay = Math.max(1, day - 1);
                              applyAndSet(year, month, nextDay);
                            }}
                          >
                            −
                          </HoldableStepperButton>
                          <Text
                            style={{
                              color: 'white',
                              fontSize: 18,
                              fontWeight: '700',
                              minWidth: 48,
                              textAlign: 'center',
                            }}
                          >
                            {day}
                          </Text>
                          <HoldableStepperButton
                            onPress={() => {
                              const nextDay = Math.min(31, day + 1);
                              applyAndSet(year, month, nextDay);
                            }}
                          >
                            +
                          </HoldableStepperButton>
                        </View>
                      </View>

                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <HoldableStepperButton
                            onPress={() => {
                              const nextMonth = Math.max(1, month - 1);
                              applyAndSet(year, nextMonth, day);
                            }}
                          >
                            −
                          </HoldableStepperButton>
                          <Text
                            style={{
                              color: 'white',
                              fontSize: 18,
                              fontWeight: '700',
                              minWidth: 48,
                              textAlign: 'center',
                            }}
                          >
                            {month}
                          </Text>
                          <HoldableStepperButton
                            onPress={() => {
                              const nextMonth = Math.min(12, month + 1);
                              applyAndSet(year, nextMonth, day);
                            }}
                          >
                            +
                          </HoldableStepperButton>
                        </View>
                      </View>

                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Anno</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <HoldableStepperButton
                            onPress={() => {
                              const nextYear = year - 1;
                              applyAndSet(nextYear, month, day);
                            }}
                          >
                            −
                          </HoldableStepperButton>
                          <Text
                            style={{
                              color: 'white',
                              fontSize: 18,
                              fontWeight: '700',
                              minWidth: 72,
                              textAlign: 'center',
                            }}
                          >
                            {year}
                          </Text>
                          <HoldableStepperButton
                            onPress={() => {
                              const nextYear = year + 1;
                              applyAndSet(nextYear, month, day);
                            }}
                          >
                            +
                          </HoldableStepperButton>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* Orario partenza / arrivo con stepper come Task (rinominati Partenza / Arrivo) */}
              <View style={{ marginTop: 20 }}>
                {(() => {
                  const baseStart = hhmmToMinutesSafe(m.travelOrarioPartenza, 8 * 60);
                  const baseEndToday = hhmmToMinutesSafe(m.travelOrarioArrivo, baseStart + 60);
                  const baseEnd = baseEndToday + (m.travelArrivoGiornoDopo ? 24 * 60 : 0);
                  const startMin = Math.min(baseStart, baseEnd - 5);
                  const endMin = Math.max(baseEnd, startMin + 5);
                  const endShown = endMin >= 24 * 60 ? (endMin - 24 * 60) : endMin;
                  const endIsNextDay = endMin >= 24 * 60;

                  // Spinge avanti partenza/arrivo ritorno se l'arrivo andata li supera.
                  // Se supera 23:55 → avanza il giorno ritorno e riparte da 00:00.
                  const pushReturnIfNeeded = (newArrivalAbs: number) => {
                    if (!m.travelGiornoRitorno) return;
                    const pDate = parseYmdSafe(m.travelGiornoPartenza);
                    const rDate = parseYmdSafe(m.travelGiornoRitorno);
                    const dS = new Date(pDate.year, pDate.month - 1, pDate.day);
                    const dR = new Date(rDate.year, rDate.month - 1, rDate.day);
                    const dd = Math.round((dR.getTime() - dS.getTime()) / (1000 * 60 * 60 * 24));
                    const retDepMin = hhmmToMinutesSafe(m.travelOrarioPartenzaRitorno, 17 * 60);
                    const absRetDep = dd * 24 * 60 + retDepMin;
                    if (newArrivalAbs < absRetDep) return;
                    // Partenza ritorno = arrivo andata (stesso orario), arrivo ritorno = +5
                    const relRetDep = newArrivalAbs - dd * 24 * 60;
                    if (relRetDep >= 24 * 60) {
                      const extraDays = Math.floor(relRetDep / (24 * 60));
                      dR.setDate(dR.getDate() + extraDays);
                      m.setTravelGiornoRitorno(formatYmd(dR.getFullYear(), dR.getMonth() + 1, dR.getDate()));
                      const wrapped = relRetDep - extraDays * 24 * 60;
                      m.setTravelPartenzaRitornoGiornoDopo(false);
                      m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(wrapped));
                      const retArr = wrapped + 5;
                      if (retArr >= 24 * 60) {
                        m.setTravelArrivoRitornoGiornoDopo(true);
                        m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr - 24 * 60));
                      } else {
                        m.setTravelArrivoRitornoGiornoDopo(false);
                        m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr));
                      }
                    } else {
                      m.setTravelPartenzaRitornoGiornoDopo(false);
                      m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(relRetDep));
                      const relRetArr = relRetDep + 5;
                      if (relRetArr >= 24 * 60) {
                        m.setTravelArrivoRitornoGiornoDopo(true);
                        m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(relRetArr - 24 * 60));
                      } else {
                        m.setTravelArrivoRitornoGiornoDopo(false);
                        m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(relRetArr));
                      }
                    }
                  };

                  const setStart = (next: number) => {
                    const clamped = Math.max(0, Math.min(24 * 60 - 5, next));
                    const safeEnd = Math.max(endMin, clamped + 5);
                    const capped = Math.min(safeEnd, 24 * 60 + (24 * 60 - 5));
                    m.setTravelOrarioPartenza(minutesToHhmmSafe(clamped));
                    if (capped >= 24 * 60) {
                      m.setTravelArrivoGiornoDopo(true);
                      m.setTravelOrarioArrivo(minutesToHhmmSafe(capped - 24 * 60));
                    } else {
                      m.setTravelArrivoGiornoDopo(false);
                      m.setTravelOrarioArrivo(minutesToHhmmSafe(capped));
                    }
                    if (capped !== endMin) pushReturnIfNeeded(capped);
                  };

                  const setEnd = (next: number) => {
                    const clamped = Math.max(startMin + 5, Math.min(24 * 60 + (24 * 60 - 5), next));
                    if (clamped >= 24 * 60) {
                      m.setTravelArrivoGiornoDopo(true);
                      m.setTravelOrarioArrivo(minutesToHhmmSafe(clamped - 24 * 60));
                    } else {
                      m.setTravelArrivoGiornoDopo(false);
                      m.setTravelOrarioArrivo(minutesToHhmmSafe(clamped));
                    }
                    pushReturnIfNeeded(clamped);
                  };

                  const diff = endMin - startMin;
                  const durationLabel = diff > 0 ? formatDuration(diff) : '';

                  return (
                    <>
                      <View style={styles.timeColumn}>
                        <View style={styles.timeSection}>
                          <Text style={styles.timeSectionTitle}>Partenza</Text>
                          <View style={styles.timePicker}>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>Ore</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton onPress={() => setStart(startMin - 60)}>−</HoldableStepperButton>
                                <Text style={styles.timeValue}>{Math.floor(startMin / 60)}</Text>
                                <HoldableStepperButton onPress={() => setStart(startMin + 60)}>+</HoldableStepperButton>
                              </View>
                            </View>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>Min</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton onPress={() => setStart(startMin - 5)}>−</HoldableStepperButton>
                                <Text style={styles.timeValue}>{startMin % 60}</Text>
                                <HoldableStepperButton onPress={() => setStart(startMin + 5)}>+</HoldableStepperButton>
                              </View>
                            </View>
                          </View>
                        </View>

                        <View style={styles.timeSection}>
                          <Text style={styles.timeSectionTitle}>
                            Arrivo{endIsNextDay ? ' (giorno dopo)' : ''}
                          </Text>
                          <View style={styles.timePicker}>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>Ore</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton onPress={() => setEnd(endMin - 60)}>−</HoldableStepperButton>
                                <Text style={styles.timeValue}>{Math.floor(endShown / 60)}</Text>
                                <HoldableStepperButton onPress={() => setEnd(endMin + 60)}>+</HoldableStepperButton>
                              </View>
                            </View>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>Min</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton onPress={() => setEnd(endMin - 5)}>−</HoldableStepperButton>
                                <Text style={styles.timeValue}>{endShown % 60}</Text>
                                <HoldableStepperButton onPress={() => setEnd(endMin + 5)}>+</HoldableStepperButton>
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>
                      {!!durationLabel && (
                        <Text style={styles.duration}>{durationLabel}</Text>
                      )}
                    </>
                  );
                })()}
              </View>

              {/* Giorno ritorno sotto orari */}
              <View style={{ marginTop: 16 }}>
                <Text style={styles.subtle}>Giorno ritorno (opzionale)</Text>
                {!m.travelGiornoRitorno ? (
                  <TouchableOpacity
                    onPress={() => {
                      // Se l'arrivo dell'andata è marcato "giorno dopo",
                      // il giorno di ritorno parte già dal giorno successivo.
                      if (m.travelArrivoGiornoDopo) {
                        const partenza = parseYmdSafe(m.travelGiornoPartenza);
                        const base = new Date(partenza.year, partenza.month - 1, partenza.day);
                        base.setDate(base.getDate() + 1);
                        const nextY = base.getFullYear();
                        const nextM = base.getMonth() + 1;
                        const nextD = base.getDate();
                        m.setTravelGiornoRitorno(formatYmd(nextY, nextM, nextD));
                      } else {
                        m.setTravelGiornoRitorno(m.travelGiornoPartenza);
                      }
                    }}
                    style={[styles.chip, styles.chipGhost, { marginTop: 8, alignSelf: 'flex-start' }]}
                  >
                    <Text style={styles.chipGhostText}>Aggiungi giorno ritorno</Text>
                  </TouchableOpacity>
                ) : (
                  (() => {
                    const parsed = parseYmdSafe(m.travelGiornoRitorno);
                    const partenzaParsed = parseYmdSafe(m.travelGiornoPartenza);
                    const today = new Date();
                    const baseMinDate = new Date(
                      partenzaParsed.year,
                      partenzaParsed.month - 1,
                      partenzaParsed.day,
                    );
                    // Se l'arrivo dell'andata è "giorno dopo", il minimo ritorno è dal giorno successivo.
                    if (m.travelArrivoGiornoDopo) {
                      baseMinDate.setDate(baseMinDate.getDate() + 1);
                    }
                    const clamped = clampYmdNotBefore(baseMinDate, parsed.year, parsed.month, parsed.day);
                    const { year, month, day } = clamped;
                    const isToday =
                      year === today.getFullYear() &&
                      month === today.getMonth() + 1 &&
                      day === today.getDate();
                    const applyAndSet = (nextYear: number, nextMonth: number, nextDay: number) => {
                      const fixed = clampYmdNotBefore(baseMinDate, nextYear, nextMonth, nextDay);
                      m.setTravelGiornoRitorno(formatYmd(fixed.year, fixed.month, fixed.day));
                    };

                    return (
                      <View style={{ marginTop: 8 }}>
                        <View
                          style={[
                            {
                              flexDirection: 'row',
                              alignItems: 'flex-end',
                              justifyContent: 'space-between',
                            },
                            isToday && {
                              borderWidth: 2,
                              borderColor: '#ff3b30',
                              borderRadius: 12,
                              paddingVertical: 8,
                              paddingHorizontal: 4,
                            },
                          ]}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              gap: 12,
                              justifyContent: 'center',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              flex: 1,
                            }}
                          >
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <HoldableStepperButton
                                onPress={() => {
                                  const nextDay = Math.max(1, day - 1);
                                  applyAndSet(year, month, nextDay);
                                }}
                              >
                                −
                              </HoldableStepperButton>
                              <Text
                                style={{
                                  color: 'white',
                                  fontSize: 18,
                                  fontWeight: '700',
                                  minWidth: 48,
                                  textAlign: 'center',
                                }}
                              >
                                {day}
                              </Text>
                              <HoldableStepperButton
                                onPress={() => {
                                  const nextDay = Math.min(31, day + 1);
                                  applyAndSet(year, month, nextDay);
                                }}
                              >
                                +
                              </HoldableStepperButton>
                            </View>
                          </View>

                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <HoldableStepperButton
                                onPress={() => {
                                  const nextMonth = Math.max(1, month - 1);
                                  applyAndSet(year, nextMonth, day);
                                }}
                              >
                                −
                              </HoldableStepperButton>
                              <Text
                                style={{
                                  color: 'white',
                                  fontSize: 18,
                                  fontWeight: '700',
                                  minWidth: 48,
                                  textAlign: 'center',
                                }}
                              >
                                {month}
                              </Text>
                              <HoldableStepperButton
                                onPress={() => {
                                  const nextMonth = Math.min(12, month + 1);
                                  applyAndSet(year, nextMonth, day);
                                }}
                              >
                                +
                              </HoldableStepperButton>
                            </View>
                          </View>

                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Anno</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <HoldableStepperButton
                                onPress={() => {
                                  const nextYear = year - 1;
                                  applyAndSet(nextYear, month, day);
                                }}
                              >
                                −
                              </HoldableStepperButton>
                              <Text
                                style={{
                                  color: 'white',
                                  fontSize: 18,
                                  fontWeight: '700',
                                  minWidth: 72,
                                  textAlign: 'center',
                                }}
                              >
                                {year}
                              </Text>
                              <HoldableStepperButton
                                onPress={() => {
                                  const nextYear = year + 1;
                                  applyAndSet(nextYear, month, day);
                                }}
                              >
                                +
                              </HoldableStepperButton>
                            </View>
                          </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => m.setTravelGiornoRitorno(undefined)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ marginRight: 8 }}
                          >
                            <View
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                backgroundColor: '#ff3b30',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Ionicons name="close" size={16} color="#ffffff" />
                            </View>
                          </TouchableOpacity>
                        </View>

                        {/* Orari di ritorno: Partenza / Arrivo separati */}
                        <View style={{ marginTop: 14 }}>
                          {(() => {
                            // Vincoli orari per il ritorno:
                            // - se è lo stesso giorno della partenza (senza "giorno dopo"), il ritorno non può iniziare prima dell'arrivo andata
                            // - se la partenza arriva "giorno dopo" e il ritorno è impostato al giorno successivo,
                            //   il ritorno non può iniziare prima dell'orario di arrivo (sul nuovo giorno)
                            const partenzaDate = parseYmdSafe(m.travelGiornoPartenza);
                            const ritornoDate = m.travelGiornoRitorno ? parseYmdSafe(m.travelGiornoRitorno) : partenzaDate;
                            const dStart = new Date(partenzaDate.year, partenzaDate.month - 1, partenzaDate.day);
                            const dRet = new Date(ritornoDate.year, ritornoDate.month - 1, ritornoDate.day);
                            const dayDiff = Math.round((dRet.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));

                            const sameDayReturn =
                              dayDiff === 0 &&
                              !m.travelArrivoGiornoDopo &&
                              !m.travelArrivoRitornoGiornoDopo;

                            const nextDayReturnAfterOvernight =
                              dayDiff === 1 &&
                              m.travelArrivoGiornoDopo &&
                              !m.travelArrivoRitornoGiornoDopo;

                            const departOutMin = hhmmToMinutesSafe(m.travelOrarioPartenza, 8 * 60);
                            const arriveOutMin = hhmmToMinutesSafe(m.travelOrarioArrivo, departOutMin + 60);
                            const earliestReturnMin = sameDayReturn || nextDayReturnAfterOvernight ? arriveOutMin + 5 : 0;

                            const rawStartRToday = hhmmToMinutesSafe(
                              m.travelOrarioPartenzaRitorno,
                              earliestReturnMin > 0 ? earliestReturnMin : 17 * 60
                            );
                            const rawStartR = rawStartRToday;
                            // Applica il vincolo solo nel calcolo locale; gli state update
                            // avvengono nelle funzioni setStartR/setEndR per evitare loop di render.
                            let baseStartR = Math.max(rawStartR, earliestReturnMin);
                            const rawEndRToday = hhmmToMinutesSafe(
                              m.travelOrarioArrivoRitorno ?? m.travelOrarioArrivo,
                              baseStartR + 60
                            );
                            const rawEndR = rawEndRToday + (m.travelArrivoRitornoGiornoDopo ? 24 * 60 : 0);
                            const baseEndR = Math.max(rawEndR, baseStartR + 5);
                            const startMinR = Math.min(baseStartR, baseEndR - 5);
                            const endMinR = Math.max(baseEndR, startMinR + 5);
                            const endShownR = endMinR >= 24 * 60 ? (endMinR - 24 * 60) : endMinR;
                            const endIsNextDayR = endMinR >= 24 * 60;

                            const setStartR = (next: number) => {
                              const lowerBound = Math.max(earliestReturnMin, 0);
                              const upperBound = Math.min(endMinR - 5, 24 * 60 - 5);
                              const clamped = Math.max(lowerBound, Math.min(upperBound, next));
                              if (clamped === startMinR) return;
                              m.setTravelPartenzaRitornoGiornoDopo(false);
                              m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(clamped));
                            };

                            const setEndR = (next: number) => {
                              const clamped = Math.max(5, Math.min(24 * 60 + (24 * 60 - 5), next));
                              if (clamped < endMinR) {
                                // Scende: trascina giù anche la partenza mantenendo il gap
                                const newStart = Math.max(earliestReturnMin, startMinR - (endMinR - clamped));
                                m.setTravelPartenzaRitornoGiornoDopo(false);
                                m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(newStart));
                              }
                              if (clamped >= 24 * 60) {
                                m.setTravelArrivoRitornoGiornoDopo(true);
                                m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(clamped - 24 * 60));
                              } else {
                                m.setTravelArrivoRitornoGiornoDopo(false);
                                m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(clamped));
                              }
                            };

                            const diffR = endMinR - startMinR;
                            const durationLabelR = diffR > 0 ? formatDuration(diffR) : '';

                            return (
                              <>
                                <View style={styles.timeColumn}>
                                  <View style={styles.timeSection}>
                                    <Text style={styles.timeSectionTitle}>
                                      Partenza (ritorno)
                                    </Text>
                                    <View style={styles.timePicker}>
                                      <View style={styles.timeControls}>
                                        <Text style={styles.timeLabel}>Ore</Text>
                                        <View style={styles.timeStepperRow}>
                                          <HoldableStepperButton onPress={() => setStartR(startMinR - 60)}>
                                            −
                                          </HoldableStepperButton>
                                          <Text style={styles.timeValue}>{Math.floor(startMinR / 60)}</Text>
                                          <HoldableStepperButton onPress={() => setStartR(startMinR + 60)}>
                                            +
                                          </HoldableStepperButton>
                                        </View>
                                      </View>
                                      <View style={styles.timeControls}>
                                        <Text style={styles.timeLabel}>Min</Text>
                                        <View style={styles.timeStepperRow}>
                                          <HoldableStepperButton onPress={() => setStartR(startMinR - 5)}>
                                            −
                                          </HoldableStepperButton>
                                          <Text style={styles.timeValue}>{startMinR % 60}</Text>
                                          <HoldableStepperButton onPress={() => setStartR(startMinR + 5)}>
                                            +
                                          </HoldableStepperButton>
                                        </View>
                                      </View>
                                    </View>
                                  </View>

                                  <View style={styles.timeSection}>
                                    <Text style={styles.timeSectionTitle}>
                                      Arrivo (ritorno){endIsNextDayR ? ' (giorno dopo)' : ''}
                                    </Text>
                                    <View style={styles.timePicker}>
                                      <View style={styles.timeControls}>
                                        <Text style={styles.timeLabel}>Ore</Text>
                                        <View style={styles.timeStepperRow}>
                                          <HoldableStepperButton onPress={() => setEndR(endMinR - 60)}>
                                            −
                                          </HoldableStepperButton>
                                          <Text style={styles.timeValue}>{Math.floor(endShownR / 60)}</Text>
                                          <HoldableStepperButton onPress={() => setEndR(endMinR + 60)}>
                                            +
                                          </HoldableStepperButton>
                                        </View>
                                      </View>
                                      <View style={styles.timeControls}>
                                        <Text style={styles.timeLabel}>Min</Text>
                                        <View style={styles.timeStepperRow}>
                                          <HoldableStepperButton onPress={() => setEndR(endMinR - 5)}>
                                            −
                                          </HoldableStepperButton>
                                          <Text style={styles.timeValue}>{endShownR % 60}</Text>
                                          <HoldableStepperButton onPress={() => setEndR(endMinR + 5)}>
                                            +
                                          </HoldableStepperButton>
                                        </View>
                                      </View>
                                    </View>
                                  </View>
                                </View>
                                {!!durationLabelR && (
                                  <Text style={styles.duration}>{durationLabelR}</Text>
                                )}
                              </>
                            );
                          })()}
                        </View>
                      </View>
                    );
                  })()
                )}
              </View>
            </View>
          )}

          {(m.tipo !== 'viaggio') && (type === 'schedule' || ((type === 'new' || type === 'edit') && (m.tipo !== 'task' || m.taskHasTime))) && (
            <View>
              {m.tipo !== 'viaggio' && (
                <>
                  <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>Frequenza</Text></View>
                  <View style={styles.row}>
                    <TouchableOpacity onPress={() => m.setFreqWithConfirmation('single')} style={[styles.chip, m.freq === 'single' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'single' ? styles.chipActiveText : styles.chipGhostText}>Singola</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => m.setFreqWithConfirmation('daily')} style={[styles.chip, m.freq === 'daily' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'daily' ? styles.chipActiveText : styles.chipGhostText}>Ogni giorno</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.row, { marginTop: 8 }]}>
                    <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('weekly'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, m.freq === 'weekly' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'weekly' ? styles.chipActiveText : styles.chipGhostText}>Settimanale</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('monthly'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, m.freq === 'monthly' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'monthly' ? styles.chipActiveText : styles.chipGhostText}>Mensile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('annual'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, m.freq === 'annual' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'annual' ? styles.chipActiveText : styles.chipGhostText}>Annuale</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}


              {m.freq === 'weekly' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorni della settimana</Text>
                  <View style={styles.daysWrap}>
                    {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((d, i) => {
                      const sundayIndex = (i + 1) % 7; // map Mon->1 ... Sun->0
                      const selected = m.daysOfWeek.includes(sundayIndex);
                      return (
                        <TouchableOpacity key={i} onPress={() => m.toggleDow(sundayIndex)} style={[styles.dayPill, selected ? styles.dayPillOn : styles.dayPillOff]}>
                          <Text style={selected ? styles.dayTextOn : styles.dayTextOff}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {m.freq === 'monthly' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorni del mese</Text>
                  <View style={styles.monthlyDaysWrap}>
                    {Array.from({ length: 31 }).map((_, i) => (
                      <TouchableOpacity key={i} onPress={() => m.toggleMonthDay(i + 1)} style={[styles.monthlyDayPill, m.monthDays.includes(i + 1) ? styles.dayPillOn : styles.dayPillOff]}>
                        <Text style={m.monthDays.includes(i + 1) ? styles.dayTextOn : styles.dayTextOff}>{i + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}


              {m.freq === 'annual' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorno dell&apos;anno</Text>
                  <View style={[
                    { flexDirection: 'row', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
                    m.isToday && { borderWidth: 2, borderColor: '#ff3b30', borderRadius: 12, padding: 8 }
                  ]}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HoldableStepperButton onPress={() => m.setAnnualDay(d => Math.max(1, d - 1))}>−</HoldableStepperButton>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualDay}</Text>
                        <HoldableStepperButton onPress={() => m.setAnnualDay(d => Math.min(31, d + 1))}>+</HoldableStepperButton>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HoldableStepperButton onPress={() => m.setAnnualMonth(prev => Math.max(1, prev - 1))}>−</HoldableStepperButton>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualMonth}</Text>
                        <HoldableStepperButton onPress={() => m.setAnnualMonth(prev => Math.min(12, prev + 1))}>+</HoldableStepperButton>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {m.freq === 'single' && m.tipo !== 'viaggio' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorno specifico</Text>
                  <View style={[
                    { flexDirection: 'row', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
                    m.isToday && { borderWidth: 2, borderColor: '#ff3b30', borderRadius: 12, padding: 8 }
                  ]}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HoldableStepperButton onPress={() => m.setAnnualDay(d => Math.max(1, d - 1))}>−</HoldableStepperButton>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualDay}</Text>
                        <HoldableStepperButton onPress={() => m.setAnnualDay(d => Math.min(31, d + 1))}>+</HoldableStepperButton>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HoldableStepperButton onPress={() => m.setAnnualMonth(prev => Math.max(1, prev - 1))}>−</HoldableStepperButton>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualMonth}</Text>
                        <HoldableStepperButton onPress={() => m.setAnnualMonth(prev => Math.min(12, prev + 1))}>+</HoldableStepperButton>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Anno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HoldableStepperButton onPress={() => m.setAnnualYear(y => y - 1)}>−</HoldableStepperButton>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{m.annualYear}</Text>
                        <HoldableStepperButton onPress={() => m.setAnnualYear(y => y + 1)}>+</HoldableStepperButton>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>Orario</Text></View>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => m.setModeWithConfirmation('allDay')} style={[styles.chip, m.mode === 'allDay' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.mode === 'allDay' ? styles.chipActiveText : styles.chipGhostText}>Tutto il giorno</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => m.setModeWithConfirmation('timed')} style={[styles.chip, m.mode === 'timed' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.mode === 'timed' ? styles.chipActiveText : styles.chipGhostText}>Orario specifico</Text>
                </TouchableOpacity>
              </View>

              {m.mode === 'timed' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Orario</Text>
                  {m.freq === 'weekly' && m.daysOfWeek.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>Giorni selezionati</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {([1,2,3,4,5,6,0] as number[]).filter(d => m.daysOfWeek.includes(d)).map(d => {
                          const names = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
                          const label = names[d].slice(0, 3);
                          const active = m.selectedDow === d;
                          return (
                            <TouchableOpacity key={d} onPress={() => m.setSelectedDow(d)} style={[styles.chip, active ? styles.chipActive : styles.chipGhost]}>
                              <Text style={active ? styles.chipActiveText : styles.chipGhostText}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {m.freq === 'monthly' && m.monthDays.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>Giorni del mese selezionati</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {[...m.monthDays].sort((a,b)=>a-b).map(d => {
                          const label = String(d);
                          const active = m.selectedMonthDay === d;
                          return (
                            <TouchableOpacity key={d} onPress={() => m.setSelectedMonthDay(d)} style={[styles.chip, active ? styles.chipActive : styles.chipGhost]}>
                              <Text style={active ? styles.chipActiveText : styles.chipGhostText}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  <View style={styles.timeColumn}>
                    <View style={styles.timeSection}>
                      <Text style={styles.timeSectionTitle}>Inizio</Text>
                    <View style={styles.timePicker}>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Ore</Text>
                          <View style={styles.timeStepperRow}>
                            <HoldableStepperButton onPress={() => m.updateCurrentStartMin(Math.max(0, m.currentStartMin - 60))}>−</HoldableStepperButton>
                            <Text style={styles.timeValue}>{Math.floor(m.currentStartMin / 60)}</Text>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              const newStartMin = curS + 60;
                              const maxStartMin = curE ? curE - 5 : 23 * 60;
                              m.updateCurrentStartMin(Math.min(maxStartMin, newStartMin));
                            }}>+</HoldableStepperButton>
                          </View>
                        </View>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Min</Text>
                          <View style={styles.timeStepperRow}>
                            <HoldableStepperButton onPress={() => m.updateCurrentStartMin(Math.max(0, m.currentStartMin - 5))}>−</HoldableStepperButton>
                            <Text style={styles.timeValue}>{m.currentStartMin % 60}</Text>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              const newStartMin = curS + 5;
                              const maxStartMin = curE ? curE - 5 : 23 * 60 + 55;
                              m.updateCurrentStartMin(Math.min(maxStartMin, newStartMin));
                            }}>+</HoldableStepperButton>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.timeSection}>
                      <Text style={styles.timeSectionTitle}>Fine</Text>
                      <View style={styles.timePicker}>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Ore</Text>
                          <View style={styles.timeStepperRow}>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.max(curS + 5, (curE ?? curS + 60) - 60));
                            }}>−</HoldableStepperButton>
                            <Text style={styles.timeValue}>{Math.floor(((m.currentEndMin ?? (m.currentStartMin + 60)) / 60))}</Text>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.min(24 * 60, (curE ?? curS + 60) + 60));
                            }}>+</HoldableStepperButton>
                    </View>
                        </View>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Min</Text>
                          <View style={styles.timeStepperRow}>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.max(curS + 5, (curE ?? curS + 60) - 5));
                            }}>−</HoldableStepperButton>
                            <Text style={styles.timeValue}>{((m.currentEndMin ?? (m.currentStartMin + 60)) % 60)}</Text>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.min(24 * 60, (curE ?? curS + 60) + 5));
                            }}>+</HoldableStepperButton>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.duration}>{formatDuration((m.currentEndMin ?? (m.currentStartMin + 60)) - m.currentStartMin)}</Text>
                </View>
              )}
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'task' && (
            <View style={{ marginTop: 20 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Automazioni posizione</Text>
              </View>
              {(!canAskLocationPermission() || locationStatus === 'denied' || locationStatus === 'none') && (
                <Text style={styles.subtle}>
                  Per usare le automazioni posizione devi abilitare la posizione per Omnia nelle impostazioni. Puoi continuare a usare la task normalmente.
                </Text>
              )}
              {canAskLocationPermission() && locationStatus !== 'denied' && (
                <>
                  {places.length === 0 ? (
                    <Text style={styles.subtle}>
                      Nessun luogo ancora. Aggiungi luoghi dalla schermata Luoghi (icona mappa nel menu ⋯ delle task) per collegare questa task a un posto.
                    </Text>
                  ) : (
                    <>
                      <Text style={[styles.subtle, { marginTop: 6 }]}>
                        Collega questa task a un luogo. Regola: completa quando esci dal raggio del luogo scelto.
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginTop: 8 }}
                        contentContainerStyle={{ gap: 8 }}
                      >
                        <TouchableOpacity
                          onPress={() => setSelectedPlaceId(null)}
                          style={[
                            styles.chip,
                            selectedPlaceId === null ? styles.chipActive : styles.chipGhost,
                            { paddingHorizontal: 16, paddingVertical: 8 },
                          ]}
                        >
                          <Text style={selectedPlaceId === null ? styles.chipActiveText : styles.chipGhostText}>
                            Nessuna automazione
                          </Text>
                        </TouchableOpacity>
                        {places.map((p) => (
                          <TouchableOpacity
                            key={p.id}
                            onPress={() => setSelectedPlaceId(p.id)}
                            style={[
                              styles.chip,
                              selectedPlaceId === p.id ? styles.chipActive : styles.chipGhost,
                              { paddingHorizontal: 16, paddingVertical: 8 },
                            ]}
                          >
                            <Text style={selectedPlaceId === p.id ? styles.chipActiveText : styles.chipGhostText}>
                              {p.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </>
                  )}
                </>
              )}
            </View>
          )}

          {type === 'color' && (
            <View style={[styles.colorSheet, { marginTop: 'auto' }]}>
              <View style={styles.colorsRowWrap}>
                {COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => m.setColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderColor: m.color === c ? (c === '#ffffff' ? '#00ff00' : '#ffffff') : 'transparent' }]} />
                ))}
              </View>
            </View>
          )}

          </View>
        </ScrollView>

        {/* Fixed position buttons */}
        <View style={styles.fixedButtonsContainer}>
          <TouchableOpacity onPress={m.close} style={[styles.circularBtn, styles.cancelBtn]}>
            <Ionicons name="close" size={52} color="#ff0000" />
              </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if ((type === 'new' || type === 'edit') && m.tipo === 'task') {
                const placeId = selectedPlaceId ?? null;
                if (placeId) {
                  m.setLocationRule({
                    type: 'geofenceExit',
                    placeId,
                    minOutsideMinutes: 3,
                  });
                } else {
                  m.setLocationRule(null);
                }
              }
              m.save();
            }}
            style={[styles.circularBtn, styles.saveBtn]}
          >
            <Ionicons name="checkmark" size={52} color="#00ff00" />
              </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>

      <ConfirmationModal
        visible={m.confirmationModal.visible}
        title={m.confirmationModal.title}
        message={m.confirmationModal.message}
        onConfirm={m.confirmationModal.onConfirm}
        onCancel={m.closeConfirmationModal}
        isDark={isDark}
      />
    </>
  );
}
