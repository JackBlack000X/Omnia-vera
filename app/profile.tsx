import { posthog } from '@/lib/posthog';
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
import { HABIT_PRIORITY_LEVELS, type HabitPriority } from '@/lib/habits/schema';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import { useLocaleSettings } from '@/lib/i18n/LocaleProvider';
import { SUPPORTED_LANGS, type AppLocalePreference } from '@/lib/i18n/resolveLocale';
import { getFallbackCity, setFallbackCity, clearWeatherCache, searchCities, type CityInfo } from '@/lib/weather';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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

function getPriorityAccent(priority: HabitPriority) {
  if (priority === 'maximum') {
    return {
      chip: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.10)' },
      main: { backgroundColor: 'rgba(239, 68, 68, 0.18)' },
      text: { color: '#ffffff' },
    };
  }
  if (priority === 'minimum') {
    return {
      chip: { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.10)' },
      main: { backgroundColor: 'rgba(34, 197, 94, 0.18)' },
      text: { color: '#ffffff' },
    };
  }
  return {
    chip: { borderColor: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.12)' },
    main: { backgroundColor: 'rgba(251, 191, 36, 0.22)' },
    text: { color: '#ffffff' },
  };
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { preference, setPreference } = useLocaleSettings();
  const fmt = useFormatLocale();
  const { habits, history, setHabits, defaultPriority, setDefaultPriority } = useHabits();
  const router = useRouter();

  const formatKm = (value: number) =>
    `${value.toLocaleString(fmt, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${t('common.km')}`;

  const localePreferenceOptions = useMemo((): AppLocalePreference[] => ['system', ...SUPPORTED_LANGS], []);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const currentLanguageLabel = useMemo(
    () => (preference === 'system' ? t('localeNames.system') : t(`localeNames.${preference}`)),
    [preference, t],
  );
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

  const priorityLabel = React.useCallback((priority: HabitPriority) => {
    if (priority === 'maximum') return t('modal.priorityMaximum');
    if (priority === 'minimum') return t('modal.priorityMinimum');
    return t('modal.priorityMedium');
  }, [t]);

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
      setHealthError(t('profile.healthReadError'));
    } finally {
      setHealthLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    if (!canUseHealthKit()) return;
    refreshHealthState();
  }, [refreshHealthState]);

  async function sendFeedback() {
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      Alert.alert(t('profile.feedbackLabel'), t('profile.feedbackEmpty'));
      return;
    }
    const subject = encodeURIComponent(t('profile.feedbackMailSubject'));
    const body = encodeURIComponent(trimmed);
    const mailto = `mailto:${APP_CONFIG.feedbackEmail}?subject=${subject}&body=${body}`;
    const canOpen = await Linking.canOpenURL(mailto);
    if (canOpen) {
      await Linking.openURL(mailto);
      posthog.capture('feedback_sent');
      setFeedbackText('');
      Alert.alert(t('profile.feedbackThanks'), t('profile.feedbackMailOpen'));
    } else {
      Alert.alert(t('profile.feedbackLabel'), t('profile.feedbackMailFallback', { email: APP_CONFIG.feedbackEmail }));
    }
  }

  async function exportCsv() {
    const csv = buildCsv(history);
    posthog.capture('data_exported_csv');
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'tothemoon.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      await Clipboard.setStringAsync(csv);
      Alert.alert(t('profile.csvCopiedTitle'), t('profile.csvCopiedMessage'));
    }
  }

  async function importFromAppleCalendar() {
    if (!canAskCalendarPermission()) {
      Alert.alert(t('profile.appleCalendar'), t('profile.calendarUnavailable'));
      return;
    }
    setCalendarImporting(true);
    try {
      let status = await requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionDeniedTitle'), t('profile.calendarPermissionBody'));
        return;
      }
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const end = new Date();
      end.setFullYear(end.getFullYear() + 1);
      const events = await getCalendarEventsAsync(start, end);
      const newHabits = calendarEventsToHabits(events, habits, habits.length);
      if (newHabits.length === 0) {
        Alert.alert(t('profile.appleCalendar'), t('profile.calendarNoEvents'));
        return;
      }
      setHabits((prev) => [...prev, ...newHabits]);
      posthog.capture('calendar_imported', { habits_imported: newHabits.length });
      Alert.alert(t('profile.appleCalendar'), t('profile.calendarImported', { count: newHabits.length }));
    } catch {
      Alert.alert(t('profile.errorAlertTitle'), t('profile.calendarError'));
    } finally {
      setCalendarImporting(false);
    }
  }

  function getLocationStatusLabel(status: LocationPermissionStatus): string {
    switch (status) {
      case 'background':
        return t('profile.locationStatusBackground');
      case 'foreground':
        return t('profile.locationStatusForeground');
      case 'none':
        return t('profile.locationStatusNone');
      case 'denied':
      default:
        return t('profile.locationStatusDenied');
    }
  }

  async function handleRequestLocation() {
    if (!canAskLocationPermission()) return;
    if (locationStatus === 'denied') {
      Alert.alert(
        t('profile.enableLocationTitle'),
        t('profile.enableLocationBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.openSettings'),
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
      if (result === 'foreground' || result === 'background') {
        posthog.capture('location_permission_granted', { level: result });
      }
      if (result === 'denied') {
        Alert.alert(
          t('profile.locationOffTitle'),
          t('profile.locationOffBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('profile.openSettings'),
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
      if (granted) {
        posthog.capture('health_connected');
      } else {
        setHealthError(t('profile.healthDenied'));
      }
      await refreshHealthState(granted);
    } catch {
      setHealthError(t('profile.healthConnectError'));
      setHealthLoading(false);
    }
  }

  function getHealthStatusLabel(state: HealthConnectionState): string {
    switch (state) {
      case 'ready':
        return t('profile.healthStatusReady');
      case 'needsAuthorization':
        return t('profile.healthStatusNeedsAuth');
      case 'unavailable':
        return t('profile.healthStatusUnavailable');
      case 'unknown':
        return t('profile.healthStatusUnknown');
      case 'unsupported':
      default:
        return t('profile.healthStatusUnsupported');
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <View style={styles.headerRight}>
          {section === 'statistiche' && (
            <TouchableOpacity onPress={exportCsv} style={styles.csvBtn}>
              <Text style={styles.csvText}>{t('profile.csv')}</Text>
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
          <Text style={[styles.tabText, section === 'impostazioni' && styles.tabTextActive]}>{t('profile.tabSettings')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, section === 'statistiche' && styles.tabActive]}
          onPress={() => setSection('statistiche')}
          activeOpacity={0.8}
        >
          <Ionicons name="stats-chart-outline" size={20} color={section === 'statistiche' ? '#fff' : THEME.textMuted} />
          <Text style={[styles.tabText, section === 'statistiche' && styles.tabTextActive]}>{t('profile.tabStats')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {section === 'impostazioni' && (
          <>
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>{t('profile.languageTitle')}</Text>
              <Text style={styles.feedbackSublabel}>{t('profile.languageSub')}</Text>
              <TouchableOpacity
                style={styles.langPickerButton}
                onPress={() => setLanguageModalVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.langPickerValue} numberOfLines={1}>
                  {currentLanguageLabel}
                </Text>
                <Ionicons name="chevron-down" size={22} color={THEME.textMuted} />
              </TouchableOpacity>

              <Modal
                visible={languageModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setLanguageModalVisible(false)}
              >
                <View style={styles.langModalRoot}>
                  <TouchableOpacity
                    style={styles.langModalBackdrop}
                    activeOpacity={1}
                    onPress={() => setLanguageModalVisible(false)}
                  />
                  <View style={styles.langModalSheet}>
                    <Text style={styles.langModalHeading}>{t('profile.languageTitle')}</Text>
                    <ScrollView
                      style={styles.langModalScroll}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {localePreferenceOptions.map((opt) => {
                        const selected = preference === opt;
                        const label = opt === 'system' ? t('localeNames.system') : t(`localeNames.${opt}`);
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.langRow, selected && styles.langRowActive]}
                            onPress={() => {
                              void setPreference(opt);
                              posthog.capture('language_changed', { language: opt });
                              setLanguageModalVisible(false);
                            }}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.langRowText}>{label}</Text>
                            {selected ? <Ionicons name="checkmark-circle" size={22} color={THEME.primary} /> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity
                      style={styles.langModalClose}
                      onPress={() => setLanguageModalVisible(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.langModalCloseText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            </View>
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>{t('profile.defaultPriorityTitle')}</Text>
              <Text style={styles.feedbackSublabel}>{t('profile.defaultPrioritySub')}</Text>
              <View style={styles.priorityRow}>
                {HABIT_PRIORITY_LEVELS.map((priority) => {
                  const selected = defaultPriority === priority;
                  const accent = getPriorityAccent(priority);
                  return (
                    <View key={priority} style={[styles.priorityChip, selected && accent.chip]}>
                      <TouchableOpacity
                        style={[styles.priorityChipMain, selected && accent.main]}
                        onPress={() => { void setDefaultPriority(priority); }}
                        activeOpacity={0.85}
                      >
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.82}
                          style={[styles.priorityChipText, selected && styles.priorityChipTextActive, selected && accent.text]}
                        >
                          {priorityLabel(priority)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.priorityChipStarButton}
                        onPress={() => { void setDefaultPriority(priority); }}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={selected ? 'star' : 'star-outline'}
                          size={21}
                          color={selected ? '#fbbf24' : '#94a3b8'}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
            {canAskCalendarPermission() && (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackLabel}>{t('profile.appleCalendar')}</Text>
                <Text style={styles.feedbackSublabel}>{t('profile.appleCalendarSub')}</Text>
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
                    {calendarImporting ? t('profile.importingCalendar') : t('profile.importCalendar')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {canAskLocationPermission() && (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackLabel}>{t('profile.locationAuto')}</Text>
                <Text style={styles.feedbackSublabel}>
                  {t('profile.locationAutoSub')}
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
                      ? t('profile.locationBtnSettings')
                      : t('profile.locationBtnEnable')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {canUseHealthKit() && (
              <View style={styles.feedbackBox}>
                <View style={styles.healthHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedbackLabel}>{t('profile.healthTitle')}</Text>
                    <Text style={styles.feedbackSublabel}>
                      {t('profile.healthSub')}
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
                    <Text style={styles.healthLoadingText}>{t('profile.healthLoading')}</Text>
                  </View>
                ) : healthState === 'ready' && healthSnapshot ? (
                  <>
                    <View style={styles.healthMetricsRow}>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="footsteps-outline" size={18} color={THEME.cyan} />
                        <Text style={styles.healthMetricValue}>{healthSnapshot.stepsToday.toLocaleString(fmt)}</Text>
                        <Text style={styles.healthMetricLabel}>{t('profile.healthMetricSteps')}</Text>
                      </View>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="walk-outline" size={18} color="#84cc16" />
                        <Text style={styles.healthMetricValue}>{formatKm(healthSnapshot.walkingRunningDistanceKmToday)}</Text>
                        <Text style={styles.healthMetricLabel}>{t('profile.healthMetricDistance')}</Text>
                      </View>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="flame-outline" size={18} color={THEME.orange} />
                        <Text style={styles.healthMetricValue}>{healthSnapshot.activeEnergyBurnedKcalToday.toLocaleString(fmt)}</Text>
                        <Text style={styles.healthMetricLabel}>{t('profile.healthMetricEnergy')}</Text>
                      </View>
                      <View style={styles.healthMetricCard}>
                        <Ionicons name="moon-outline" size={18} color={THEME.primary} />
                        <Text style={styles.healthMetricValue}>{formatSleepMinutes(healthSnapshot.sleepMinutesLastNight)}</Text>
                        <Text style={styles.healthMetricLabel}>{t('profile.healthMetricSleepLast')}</Text>
                      </View>
                    </View>
                    <Text style={styles.healthFootnote}>
                      {t('profile.healthFootnote')}
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
                          ? t('profile.healthConnect')
                          : t('profile.healthRetry')}
                      </Text>
                    </TouchableOpacity>
                    {healthError && <Text style={styles.healthErrorText}>{healthError}</Text>}
                  </>
                )}
              </View>
            )}
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>{t('profile.weatherTitle')}</Text>
              <Text style={styles.feedbackSublabel}>
                {t('profile.weatherSub')}
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
                    placeholder={t('profile.weatherSearchPh')}
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
                    {weatherCity?.name ?? t('profile.weatherGps')}
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
              <Text style={styles.feedbackLabel}>{t('profile.feedbackSectionTitle')}</Text>
              <Text style={styles.feedbackSublabel}>{t('profile.feedbackDevSub')}</Text>
              <TextInput
                style={styles.feedbackInput}
                placeholder={t('profile.feedbackInputPh')}
                placeholderTextColor={THEME.textMuted}
                value={feedbackText}
                onChangeText={setFeedbackText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <TouchableOpacity style={styles.sendFeedbackBtn} onPress={sendFeedback} activeOpacity={0.8}>
                <Ionicons name="send" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.sendFeedbackBtnText}>{t('profile.sendMail')}</Text>
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
                <Text style={styles.cardLabel}>{t('profile.cardLabelToday')}</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIconWrap}><Ionicons name="calendar-outline" size={24} color={THEME.primary} /></View>
                <Text style={styles.cardBig}>{averageCompletion}%</Text>
                <Text style={styles.cardLabel}>{t('profile.cardLabelWeekAvg')}</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIconWrap}><Ionicons name="flame-outline" size={24} color={THEME.orange} /></View>
                <Text style={styles.cardBig}>{activeDays}</Text>
                <Text style={styles.cardLabel}>{t('profile.cardLabelActiveDays')}</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIconWrap}><Ionicons name="trophy-outline" size={24} color={THEME.warning} /></View>
                <Text style={styles.cardBig}>{bestStreak}</Text>
                <Text style={styles.cardLabel}>{t('profile.cardLabelBestStreak')}</Text>
              </View>
            </View>

            <Text style={styles.blockTitle}>{t('profile.leaderboardTitle')}</Text>
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
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  priorityChip: {
    flex: 1,
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#314056',
    backgroundColor: '#121b2b',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  priorityChipActive: {
    borderColor: THEME.primary,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  priorityChipMain: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  priorityChipText: {
    color: '#dbe5f5',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  priorityChipTextActive: { color: '#fff' },
  priorityChipStarButton: {
    width: 40,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
  langPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  langPickerValue: { color: THEME.text, fontSize: 16, fontWeight: '600', flex: 1 },
  langModalRoot: { flex: 1, justifyContent: 'flex-end' },
  langModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  langModalSheet: {
    backgroundColor: '#020617',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: '#334155',
    maxHeight: '72%',
  },
  langModalHeading: { color: THEME.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  langModalScroll: { maxHeight: 340 },
  langModalClose: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  langModalCloseText: { color: THEME.textMuted, fontSize: 16, fontWeight: '600' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langRowActive: { borderColor: THEME.primary },
  langRowText: { color: THEME.text, fontSize: 16, fontWeight: '600' },
  calendarImportBtn: { marginBottom: 4 },
  feedbackLabel: { color: THEME.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  feedbackSublabel: { color: THEME.textMuted, fontSize: 14, marginBottom: 14 },
  feedbackInput: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 14, color: THEME.text, fontSize: 16, minHeight: 120, maxHeight: 160 },
  sendFeedbackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d4ed8', paddingVertical: 14, borderRadius: 12, marginTop: 14 },
  sendFeedbackBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
