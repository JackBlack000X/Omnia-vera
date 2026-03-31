import { APP_CONFIG } from '@/constants/app';
import { THEME } from '@/constants/theme';
import {
  canAskCalendarPermission,
  calendarEventsToHabits,
  getCalendarEventsAsync,
  requestCalendarPermissionsAsync,
} from '@/lib/appleCalendar';
import {
  canUseHealthKit,
  getHealthConnectionStateAsync,
  getHealthSnapshotAsync,
  requestHealthAuthorizationAsync,
  type HealthConnectionState,
  type HealthSnapshot,
} from '@/lib/health';
import { canAskLocationPermission, getLocationPermissionStatusAsync, requestLocationPermissionsAsync, type LocationPermissionStatus } from '@/lib/location';
import { buildCsv } from '@/lib/csv';
import { useHabits } from '@/lib/habits/Provider';
import { getFallbackCity, setFallbackCity, clearWeatherCache, searchCities, type CityInfo } from '@/lib/weather';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ProfileSection = 'impostazioni' | 'statistiche';

function formatSleepMinutes(value: number): string {
  const totalMinutes = Math.max(0, Math.round(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatKm(value: number): string {
  return `${value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export default function ProfileScreen() {
  const { habits, history, setHabits } = useHabits();
  const router = useRouter();
  const [feedbackText, setFeedbackText] = useState('');
  const [section, setSection] = useState<ProfileSection>('impostazioni');
  const [calendarImporting, setCalendarImporting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationPermissionStatus>('none');
  const [locationLoading, setLocationLoading] = useState(false);
  const [weatherCity, setWeatherCity] = useState<CityInfo | null>(null);
  const [cityEditing, setCityEditing] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<CityInfo[]>([]);
  const [citySearching, setCitySearching] = useState(false);
  const [healthState, setHealthState] = useState<HealthConnectionState>('unsupported');
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const cityInputRef = React.useRef<TextInput>(null);

  useEffect(() => {
    getFallbackCity().then(c => setWeatherCity(c));
  }, []);

  useEffect(() => {
    if (citySearch.trim().length < 2) {
      setCityResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setCitySearching(true);
      const results = await searchCities(citySearch);
      setCityResults(results);
      setCitySearching(false);
    }, 400);
    return () => clearTimeout(timeout);
  }, [citySearch]);

  const todayKey = new Date().toISOString().split('T')[0];
  const todayCompleted = useMemo(() => Object.values(history[todayKey]?.completedByHabitId ?? {}).filter(Boolean).length, [history, todayKey]);

  const activeDays = useMemo(() => Object.keys(history).filter(k => Object.values(history[k]?.completedByHabitId ?? {}).some(Boolean)).length, [history]);

  const bestStreak = useMemo(() => {
    const dates = Object.keys(history).sort();
    let best = 0; let cur = 0; let prev: string | null = null;
    for (const d of dates) {
      const any = Object.values(history[d]?.completedByHabitId ?? {}).some(Boolean);
      if (!any) { cur = 0; prev = null; continue; }
      if (!prev) { cur = 1; prev = d; best = Math.max(best, cur); continue; }
      const prevDate: Date = new Date(prev as string); const nextDate: Date = new Date(prevDate); nextDate.setDate(prevDate.getDate() + 1);
      const exp: string = nextDate.toISOString().split('T')[0];
      if (d === exp) cur += 1; else cur = 1;
      prev = d; best = Math.max(best, cur);
    }
    return best;
  }, [history]);

  const averageCompletion = useMemo(() => {
    const dates = Object.keys(history);
    if (dates.length === 0 || habits.length === 0) return 0;
    let sum = 0;
    for (const d of dates) {
      const c = Object.values(history[d]?.completedByHabitId ?? {}).filter(Boolean).length;
      sum += (c / habits.length) * 100;
    }
    return Math.round(sum / dates.length);
  }, [history, habits.length]);

  const leaderboard = useMemo(() => {
    const counts: Record<string, number> = {};
    const totals: Record<string, number> = {};
    for (const h of habits) { counts[h.id] = 0; totals[h.id] = 0; }
    for (const d of Object.keys(history)) {
      const map = history[d]?.completedByHabitId ?? {};
      for (const h of habits) {
        totals[h.id] += 1;
        if (map[h.id]) counts[h.id] += 1;
      }
    }
    return [...habits].map(h => ({ id: h.id, text: h.text, pct: totals[h.id] ? Math.round((counts[h.id] / totals[h.id]) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [habits, history]);

  React.useEffect(() => {
    if (!canAskLocationPermission()) return;
    (async () => {
      const status = await getLocationPermissionStatusAsync();
      setLocationStatus(status);
    })();
  }, []);

  const refreshHealthState = React.useCallback(async (loadSnapshot = true) => {
    if (!canUseHealthKit()) return;

    setHealthLoading(true);
    setHealthError(null);

    try {
      const nextState = await getHealthConnectionStateAsync();
      setHealthState(nextState.state);

      if (nextState.state === 'ready' && loadSnapshot) {
        const snapshot = await getHealthSnapshotAsync();
        setHealthSnapshot(snapshot);
      } else if (nextState.state !== 'ready') {
        setHealthSnapshot(null);
      }
    } catch {
      setHealthSnapshot(null);
      setHealthError('Non sono riuscito a leggere i dati di Apple Salute. Controlla i permessi nelle impostazioni iPhone.');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!canUseHealthKit()) return;
    refreshHealthState();
  }, [refreshHealthState]);

  async function sendFeedback() {
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      Alert.alert('Feedback', 'Scrivi un messaggio prima di inviare.');
      return;
    }
    const subject = encodeURIComponent('Feedback Tothemoon App');
    const body = encodeURIComponent(trimmed);
    const mailto = `mailto:${APP_CONFIG.feedbackEmail}?subject=${subject}&body=${body}`;
    const canOpen = await Linking.canOpenURL(mailto);
    if (canOpen) {
      await Linking.openURL(mailto);
      setFeedbackText('');
      Alert.alert('Grazie', 'Si aprirà la mail con il tuo messaggio. Invia l’email per inviare il feedback.');
    } else {
      Alert.alert('Feedback', `Scrivi a ${APP_CONFIG.feedbackEmail} per inviare il tuo feedback.`);
    }
  }

  async function exportCsv() {
    const csv = buildCsv(history);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'tothemoon.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      await Clipboard.setStringAsync(csv);
      Alert.alert('CSV copiato', 'Contenuto copiato negli appunti.');
    }
  }

  async function importFromAppleCalendar() {
    if (!canAskCalendarPermission()) {
      Alert.alert('Calendario', 'L\'import da calendario non è disponibile su questo dispositivo.');
      return;
    }
    setCalendarImporting(true);
    try {
      let status = await requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permesso negato',
          'Per importare gli eventi devi consentire l\'accesso al calendario nelle Impostazioni del dispositivo.'
        );
        return;
      }
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const end = new Date();
      end.setFullYear(end.getFullYear() + 1);
      const events = await getCalendarEventsAsync(start, end);
      const newHabits = calendarEventsToHabits(events, habits, habits.length);
      if (newHabits.length === 0) {
        Alert.alert('Calendario', 'Nessun nuovo evento da importare nel periodo selezionato (ultimi 30 giorni + 1 anno).');
        return;
      }
      setHabits((prev) => [...prev, ...newHabits]);
      Alert.alert('Calendario', `Importati ${newHabits.length} eventi dal Calendario Apple.`);
    } catch {
      Alert.alert('Errore', 'Impossibile importare gli eventi dal calendario.');
    } finally {
      setCalendarImporting(false);
    }
  }

  function getLocationStatusLabel(status: LocationPermissionStatus): string {
    switch (status) {
      case 'background':
        return 'Stato: Attivo (background abilitato)';
      case 'foreground':
        return 'Stato: Solo mentre usi l’app';
      case 'none':
        return 'Stato: Non ancora richiesto';
      case 'denied':
      default:
        return 'Stato: Disattivato';
    }
  }

  async function handleRequestLocation() {
    if (!canAskLocationPermission()) return;
    if (locationStatus === 'denied') {
      Alert.alert(
        'Abilita posizione',
        'Hai già rifiutato la posizione per Tothemoon. Vuoi aprire le impostazioni del dispositivo per abilitarla?',
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Apri impostazioni',
            onPress: () => {
              Linking.openSettings().catch(() => {});
            },
          },
        ],
      );
      return;
    }
    setLocationLoading(true);
    try {
      const targetKind: 'foreground' | 'background' =
        locationStatus === 'background' ? 'background' :
        locationStatus === 'foreground' ? 'background' :
        'background';
      const result = await requestLocationPermissionsAsync(targetKind);
      setLocationStatus(result);
      if (result === 'denied') {
        Alert.alert(
          'Posizione disattivata',
          'Per usare le automazioni posizione devi abilitare la posizione per Tothemoon nelle impostazioni del dispositivo.',
          [
            { text: 'Annulla', style: 'cancel' },
            {
              text: 'Apri impostazioni',
              onPress: () => {
                Linking.openSettings().catch(() => {});
              },
            },
          ],
        );
      }
    } finally {
      setLocationLoading(false);
    }
  }

  async function handleConnectHealth() {
    setHealthLoading(true);
    setHealthError(null);

    try {
      const granted = await requestHealthAuthorizationAsync();
      if (!granted) {
        setHealthError('Apple Salute non ha concesso l’accesso ai dati richiesti.');
      }
      await refreshHealthState(granted);
    } catch {
      setHealthError('Impossibile collegare Apple Salute in questo momento.');
      setHealthLoading(false);
    }
  }

  function getHealthStatusLabel(state: HealthConnectionState): string {
    switch (state) {
      case 'ready':
        return 'Stato: collegato';
      case 'needsAuthorization':
        return 'Stato: accesso non ancora autorizzato';
      case 'unavailable':
        return 'Stato: Salute non disponibile su questo dispositivo';
      case 'unknown':
        return 'Stato: verifica richiesta';
      case 'unsupported':
      default:
        return 'Stato: disponibile solo su iPhone';
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Profilo</Text>
        <View style={styles.headerRight}>
          {section === 'statistiche' && (
            <TouchableOpacity onPress={exportCsv} style={styles.csvBtn}>
              <Text style={styles.csvText}>CSV</Text>
            </TouchableOpacity>
          )}
          {section !== 'statistiche' && <View style={styles.headerSpacer} />}
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, section === 'impostazioni' && styles.tabActive]}
          onPress={() => setSection('impostazioni')}
          activeOpacity={0.8}
        >
          <Ionicons name="settings-outline" size={20} color={section === 'impostazioni' ? '#fff' : THEME.textMuted} />
          <Text style={[styles.tabText, section === 'impostazioni' && styles.tabTextActive]}>Impostazioni</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, section === 'statistiche' && styles.tabActive]}
          onPress={() => setSection('statistiche')}
          activeOpacity={0.8}
        >
          <Ionicons name="stats-chart-outline" size={20} color={section === 'statistiche' ? '#fff' : THEME.textMuted} />
          <Text style={[styles.tabText, section === 'statistiche' && styles.tabTextActive]}>Statistiche</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {section === 'impostazioni' && (
          <>
            {canAskCalendarPermission() && (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackLabel}>Calendario Apple</Text>
                <Text style={styles.feedbackSublabel}>Importa eventi dal Calendario del dispositivo in Tothemoon</Text>
                <TouchableOpacity
                  style={[styles.sendFeedbackBtn, styles.calendarImportBtn]}
                  onPress={importFromAppleCalendar}
                  disabled={calendarImporting}
                  activeOpacity={0.8}
                >
                  {calendarImporting ? (
                    <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  ) : (
                    <Ionicons name="calendar-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  )}
                  <Text style={styles.sendFeedbackBtnText}>
                    {calendarImporting ? 'Importazione...' : 'Trasferisci dati da Apple Calendario'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {canAskLocationPermission() && (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackLabel}>Automazioni posizione</Text>
                <Text style={styles.feedbackSublabel}>
                  Usa la posizione per completare automaticamente alcune task (es. Palestra) quando esci da luoghi salvati.
                </Text>
                <Text style={[styles.feedbackSublabel, { marginBottom: 10 }]}>
                  {getLocationStatusLabel(locationStatus)}
                </Text>
                <TouchableOpacity
                  style={[styles.sendFeedbackBtn, styles.calendarImportBtn]}
                  onPress={handleRequestLocation}
                  disabled={locationLoading}
                  activeOpacity={0.8}
                >
                  {locationLoading ? (
                    <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  ) : (
                    <Ionicons name="locate-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  )}
                  <Text style={styles.sendFeedbackBtnText}>
                    {locationStatus === 'background'
                      ? 'Gestisci dalle impostazioni di sistema'
                      : 'Abilita posizione per le automazioni'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {canUseHealthKit() && (
              <View style={styles.feedbackBox}>
                <View style={styles.healthHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedbackLabel}>Apple Salute</Text>
                    <Text style={styles.feedbackSublabel}>
                      Collega sonno, calorie attive, passi e km per preparare le abitudini basate su HealthKit.
                    </Text>
                    <Text style={[styles.feedbackSublabel, { marginBottom: 10 }]}>
                      {getHealthStatusLabel(healthState)}
                    </Text>
                  </View>
                  {healthState === 'ready' && (
                    <TouchableOpacity
                      style={styles.healthRefreshBtn}
                      onPress={() => refreshHealthState(true)}
                      disabled={healthLoading}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>

                {healthLoading ? (
                  <View style={styles.healthLoadingRow}>
                    <ActivityIndicator color={THEME.primary} size="small" />
                    <Text style={styles.healthLoadingText}>Aggiorno i dati Salute...</Text>
                  </View>
                ) : healthState === 'ready' && healthSnapshot ? (
                  <>
                    <View style={styles.healthMetricsRow}>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="footsteps-outline" size={18} color={THEME.cyan} />
                        <Text style={styles.healthMetricValue}>{healthSnapshot.stepsToday.toLocaleString('it-IT')}</Text>
                        <Text style={styles.healthMetricLabel}>Passi oggi</Text>
                      </View>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="walk-outline" size={18} color="#84cc16" />
                        <Text style={styles.healthMetricValue}>{formatKm(healthSnapshot.walkingRunningDistanceKmToday)}</Text>
                        <Text style={styles.healthMetricLabel}>Km oggi</Text>
                      </View>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="flame-outline" size={18} color={THEME.orange} />
                        <Text style={styles.healthMetricValue}>{healthSnapshot.activeEnergyBurnedKcalToday.toLocaleString('it-IT')}</Text>
                        <Text style={styles.healthMetricLabel}>Kcal attive</Text>
                      </View>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="moon-outline" size={18} color={THEME.primary} />
                        <Text style={styles.healthMetricValue}>{formatSleepMinutes(healthSnapshot.sleepMinutesLastNight)}</Text>
                        <Text style={styles.healthMetricLabel}>Ultima notte</Text>
                      </View>
                    </View>
                    <Text style={styles.healthFootnote}>
                      Anteprima HealthKit pronta. Nel prossimo step possiamo agganciare questi dati alle singole abitudini.
                    </Text>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.sendFeedbackBtn, styles.calendarImportBtn]}
                      onPress={handleConnectHealth}
                      disabled={healthLoading || healthState === 'unavailable'}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="heart-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.sendFeedbackBtnText}>
                        {healthState === 'needsAuthorization' || healthState === 'unknown'
                          ? 'Collega Apple Salute'
                          : 'Riprova collegamento'}
                      </Text>
                    </TouchableOpacity>
                    {healthError && <Text style={styles.healthErrorText}>{healthError}</Text>}
                  </>
                )}
              </View>
            )}
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>Meteo</Text>
              <Text style={styles.feedbackSublabel}>
                Posizione per le previsioni meteo nella vista Oggi.
              </Text>
              <TouchableOpacity
                style={styles.weatherCurrentRow}
                onPress={() => {
                  setCityEditing(true);
                  setCitySearch('');
                  setCityResults([]);
                  setTimeout(() => cityInputRef.current?.focus(), 100);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name={weatherCity ? 'location' : 'navigate'} size={18} color={THEME.primary} />
                {cityEditing ? (
                  <TextInput
                    ref={cityInputRef}
                    style={styles.weatherSearchInline}
                    placeholder="Cerca città..."
                    placeholderTextColor={THEME.textMuted}
                    value={citySearch}
                    onChangeText={setCitySearch}
                    autoCorrect={false}
                    autoFocus
                    onBlur={() => {
                      // Delay so tap on result registers first
                      setTimeout(() => {
                        setCityEditing(false);
                        setCitySearch('');
                        setCityResults([]);
                      }, 200);
                    }}
                  />
                ) : (
                  <Text style={styles.weatherCurrentText}>
                    {weatherCity?.name ?? 'GPS (posizione attuale)'}
                  </Text>
                )}
                {(weatherCity || cityEditing) && (
                  <TouchableOpacity
                    onPress={async () => {
                      setWeatherCity(null);
                      setCityEditing(false);
                      setCitySearch('');
                      setCityResults([]);
                      await setFallbackCity(null);
                      await clearWeatherCache();
                    }}
                    style={styles.weatherGpsBtn}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="navigate" size={14} color="#fff" />
                    <Text style={styles.weatherGpsBtnText}>GPS</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {citySearching && (
                <ActivityIndicator color={THEME.primary} size="small" style={{ marginVertical: 8 }} />
              )}
              {cityResults.map((city, idx) => (
                <TouchableOpacity
                  key={`${city.name}-${idx}`}
                  style={styles.weatherCityItem}
                  onPress={async () => {
                    setWeatherCity(city);
                    setCityEditing(false);
                    setCitySearch('');
                    setCityResults([]);
                    await setFallbackCity(city);
                    await clearWeatherCache();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location" size={16} color={THEME.textMuted} />
                  <Text style={styles.weatherCityItemText}>{city.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>Feedback</Text>
              <Text style={styles.feedbackSublabel}>Scrivi un messaggio allo sviluppatore</Text>
              <TextInput
                style={styles.feedbackInput}
                placeholder="Scrivi qui il tuo messaggio..."
                placeholderTextColor={THEME.textMuted}
                value={feedbackText}
                onChangeText={setFeedbackText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <TouchableOpacity style={styles.sendFeedbackBtn} onPress={sendFeedback} activeOpacity={0.8}>
                <Ionicons name="send" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.sendFeedbackBtnText}>Invia alla mail</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {section === 'statistiche' && (
          <>
            <View style={styles.cards}>
              <View style={[styles.card, styles.cardHighlight]}>
                <View style={styles.cardIconWrap}><Ionicons name="today-outline" size={24} color={THEME.cyan} /></View>
                <Text style={styles.cardBig}>{todayCompleted}/{habits.length}</Text>
                <Text style={styles.cardLabel}>Oggi</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIconWrap}><Ionicons name="calendar-outline" size={24} color={THEME.primary} /></View>
                <Text style={styles.cardBig}>{averageCompletion}%</Text>
                <Text style={styles.cardLabel}>Media settimana</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIconWrap}><Ionicons name="flame-outline" size={24} color={THEME.orange} /></View>
                <Text style={styles.cardBig}>{activeDays}</Text>
                <Text style={styles.cardLabel}>Giorni attivi</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIconWrap}><Ionicons name="trophy-outline" size={24} color={THEME.warning} /></View>
                <Text style={styles.cardBig}>{bestStreak}</Text>
                <Text style={styles.cardLabel}>Serie migliore</Text>
              </View>
            </View>

            <Text style={styles.blockTitle}>Abitudini più completate</Text>
            {leaderboard.slice(0, 10).map((l, idx) => (
              <View key={l.id} style={styles.leaderRow}>
                <View style={[styles.leaderRank, idx === 0 && styles.leaderRankGold]}>
                  <Text style={styles.leaderRankText}>{idx + 1}</Text>
                </View>
                <View style={styles.leaderContent}>
                  <Text style={styles.leaderLabel} numberOfLines={1}>{l.text}</Text>
                  <View style={styles.leaderBarBg}><View style={[styles.leaderBarFill, { width: `${l.pct}%` }]} /></View>
                </View>
                <Text style={styles.leaderPct}>{l.pct}%</Text>
              </View>
            ))}

          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEME.background, paddingHorizontal: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 12 },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { color: THEME.text, fontSize: 24, fontWeight: '700' },
  headerRight: { minWidth: 60, alignItems: 'flex-end' },
  headerSpacer: { width: 60 },
  csvBtn: { backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  csvText: { color: THEME.text, fontWeight: '700' },

  tabs: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  tabActive: { backgroundColor: '#1e3a5f', borderColor: THEME.primary },
  tabText: { color: THEME.textMuted, fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  content: { flex: 1 },
  contentInner: { paddingBottom: 32 },

  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 24 },
  card: { flexBasis: '47%', backgroundColor: '#0a0a0a', borderColor: '#334155', borderWidth: 1, borderRadius: 16, padding: 16 },
  cardHighlight: { borderColor: THEME.cyan, backgroundColor: 'rgba(34, 211, 238, 0.06)' },
  cardIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cardBig: { color: THEME.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  cardLabel: { color: THEME.textMuted, marginTop: 4, fontSize: 13, fontWeight: '500' },

  blockTitle: { color: THEME.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  leaderRank: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  leaderRankGold: { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  leaderRankText: { color: THEME.text, fontWeight: '700', fontSize: 14 },
  leaderContent: { flex: 1, minWidth: 0 },
  leaderLabel: { color: THEME.text, fontSize: 15, marginBottom: 6 },
  leaderBarBg: { height: 6, backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden' },
  leaderBarFill: { height: '100%', backgroundColor: THEME.cyan, borderRadius: 3 },
  leaderPct: { color: THEME.textMuted, fontWeight: '700', fontSize: 14, minWidth: 36, textAlign: 'right' },

  weatherCurrentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 14 },
  weatherCurrentText: { color: THEME.text, fontSize: 15, fontWeight: '600', flex: 1 },
  weatherSearchInline: { color: THEME.text, fontSize: 15, fontWeight: '600', flex: 1, padding: 0 },
  weatherGpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  weatherGpsBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  weatherCityItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#0f172a', marginTop: 4 },
  weatherCityItemText: { color: THEME.text, fontSize: 15, fontWeight: '500' },
  healthHeaderRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  healthRefreshBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d4ed8', marginTop: 2 },
  healthLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  healthLoadingText: { color: THEME.textMuted, fontSize: 14, fontWeight: '500' },
  healthMetricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  healthMetricCard: { width: '48%', minHeight: 120, backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, borderRadius: 14, padding: 12, justifyContent: 'space-between' },
  healthMetricValue: { color: THEME.text, fontSize: 21, fontWeight: '800', marginTop: 10 },
  healthMetricLabel: { color: THEME.textMuted, fontSize: 13, fontWeight: '600', marginTop: 8 },
  healthFootnote: { color: THEME.textMuted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  healthErrorText: { color: '#fca5a5', fontSize: 13, lineHeight: 18, marginTop: 10 },
  feedbackBox: { marginTop: 8 },
  calendarImportBtn: { marginBottom: 4 },
  feedbackLabel: { color: THEME.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  feedbackSublabel: { color: THEME.textMuted, fontSize: 14, marginBottom: 14 },
  feedbackInput: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 14, color: THEME.text, fontSize: 16, minHeight: 120, maxHeight: 160 },
  sendFeedbackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d4ed8', paddingVertical: 14, borderRadius: 12, marginTop: 14 },
  sendFeedbackBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
