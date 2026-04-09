import { useColorScheme } from '@/hooks/use-color-scheme';
import { ConfirmationModal } from '@/components/modal/ConfirmationModal';
import { styles, COLORS } from '@/components/modal/modalStyles';
import { canUseHealthKit, getHealthConnectionStateAsync, requestHealthAuthorizationAsync, type HealthConnectionInfo } from '@/lib/health';
import { getHealthHabitOption, HEALTH_HABIT_OPTIONS } from '@/lib/healthHabits';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import { useModalLogic } from '@/lib/modal/useModalLogic';
import { formatDuration } from '@/lib/modal/helpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { loadPlaces } from '@/lib/places';
import { searchCities, type CityInfo } from '@/lib/weather';
import { canAskLocationPermission, getLocationPermissionStatusAsync, type LocationPermissionStatus } from '@/lib/location';
import { clampYmdNotBeforeYmd, compareYmd, ymdToDate } from '@/lib/date';
import { useAppDateBounds } from '@/lib/appDateBounds';
import type { NotificationConfig } from '@/lib/habits/schema';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
    clearTimers();
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

function shiftYmd(value: string, deltaDays: number): string {
  const { year, month, day } = parseYmdSafe(value);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + deltaDays);
  return formatYmd(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

function shiftYmdByMonths(value: string, deltaMonths: number): string {
  const { year, month, day } = parseYmdSafe(value);
  const next = new Date(year, month - 1 + deltaMonths, 1);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  return formatYmd(next.getFullYear(), next.getMonth() + 1, Math.min(day, maxDay));
}

function shiftYmdByYears(value: string, deltaYears: number): string {
  const { year, month, day } = parseYmdSafe(value);
  const nextYear = year + deltaYears;
  const maxDay = new Date(nextYear, month, 0).getDate();
  return formatYmd(nextYear, month, Math.min(day, maxDay));
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

function NotificationCustomPicker({
  notification,
  setNotification,
}: {
  notification: NotificationConfig;
  setNotification: (n: NotificationConfig) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatLocale();
  const { nonPastYmd } = useAppDateBounds();
  const [showTime, setShowTime] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const timeDate = (() => {
    if (notification.customTime) {
      const [h, m] = notification.customTime.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    return new Date();
  })();

  const dateDate = (() => {
    if (notification.customDate) {
      return ymdToDate(clampYmdNotBeforeYmd(notification.customDate, nonPastYmd));
    }
    return ymdToDate(nonPastYmd);
  })();

  const formatTime = (time: string | null | undefined) =>
    time ? time : t('modal.setTime');

  const formatDate = (d: string | null | undefined) => {
    if (!d) return t('modal.anyDay');
    const dt = ymdToDate(clampYmdNotBeforeYmd(d, nonPastYmd));
    return dt.toLocaleDateString(fmt, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1e293b' }}>
      <TouchableOpacity
        onPress={() => { setShowTime(v => !v); setShowDate(false); }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}
      >
        <Text style={{ color: '#94a3b8', fontSize: 15 }}>{t('modal.notifTime')}</Text>
        <Text style={{ color: notification.customTime ? 'white' : '#475569', fontSize: 15, fontWeight: '600' }}>
          {formatTime(notification.customTime)}
        </Text>
      </TouchableOpacity>
      {showTime && (
        <DateTimePicker
          value={timeDate}
          mode="time"
          display="spinner"
          themeVariant="dark"
          textColor="white"
          onChange={(_, date) => {
            if (date) {
              const hh = String(date.getHours()).padStart(2, '0');
              const mm = String(date.getMinutes()).padStart(2, '0');
              setNotification({ ...notification, customTime: `${hh}:${mm}` });
            }
          }}
          style={{ height: 160 }}
        />
      )}
      <View style={{ height: 1, backgroundColor: '#1e293b' }} />
      <TouchableOpacity
        onPress={() => { setShowDate(v => !v); setShowTime(false); }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}
      >
        <Text style={{ color: '#94a3b8', fontSize: 15 }}>{t('modal.notifDay')}</Text>
        <Text style={{ color: notification.customDate ? 'white' : '#475569', fontSize: 15, fontWeight: '600' }}>
          {formatDate(notification.customDate)}
        </Text>
      </TouchableOpacity>
      {showDate && (
        <View>
          <DateTimePicker
            value={dateDate}
            mode="date"
            display="inline"
            themeVariant="dark"
            textColor="white"
            accentColor="#ec4899"
            minimumDate={ymdToDate(nonPastYmd)}
            onChange={(_, date) => {
              if (date) {
                const y = date.getFullYear();
                const mo = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                const next = clampYmdNotBeforeYmd(`${y}-${mo}-${d}`, nonPastYmd);
                setNotification({ ...notification, customDate: next });
                setShowDate(false);
              }
            }}
            style={{ backgroundColor: 'transparent' }}
          />
          <TouchableOpacity
            onPress={() => { setNotification({ ...notification, customDate: null }); setShowDate(false); }}
            style={{ alignItems: 'center', paddingVertical: 10 }}
          >
            <Text style={{ color: '#ec4899', fontSize: 14 }}>{t('modal.removeDay')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const REPEAT_END_ITEM_HEIGHT = 44;

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  width,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  width: number;
}) {
  const ref = useRef<ScrollView>(null);
  const [liveIndex, setLiveIndex] = React.useState(selectedIndex);

  React.useEffect(() => {
    ref.current?.scrollTo({ y: selectedIndex * REPEAT_END_ITEM_HEIGHT, animated: false });
    setLiveIndex(selectedIndex);
  }, []);

  return (
    <View style={{ width, height: REPEAT_END_ITEM_HEIGHT * 5, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: REPEAT_END_ITEM_HEIGHT * 2, left: 4, right: 4, height: REPEAT_END_ITEM_HEIGHT, backgroundColor: '#1e293b', borderRadius: 10, pointerEvents: 'none' }} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={REPEAT_END_ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: REPEAT_END_ITEM_HEIGHT * 2 }}
        onScroll={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / REPEAT_END_ITEM_HEIGHT);
          setLiveIndex(Math.max(0, Math.min(items.length - 1, idx)));
        }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / REPEAT_END_ITEM_HEIGHT);
          const clamped = Math.max(0, Math.min(items.length - 1, idx));
          setLiveIndex(clamped);
          onSelect(clamped);
        }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={item}
            onPress={() => {
              onSelect(i);
              setLiveIndex(i);
              ref.current?.scrollTo({ y: i * REPEAT_END_ITEM_HEIGHT, animated: true });
            }}
            style={{ height: REPEAT_END_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: i === liveIndex ? 'white' : '#475569', fontSize: 22, fontWeight: i === liveIndex ? '600' : '400' }}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function RepeatEndDurationPicker({
  count,
  unitLabel,
  onCountChange,
}: {
  count: number;
  unitLabel: string;
  onCountChange: (n: number) => void;
}) {
  const counts = Array.from({ length: 99 }, (_, i) => String(i + 1));

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: '#1e293b', paddingVertical: 8, paddingHorizontal: 16 }}>
      <Text style={{ color: '#94a3b8', fontSize: 15, marginBottom: 4 }}>{unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}</Text>
      <View style={{ alignItems: 'center' }}>
        <WheelColumn
          items={counts}
          selectedIndex={count - 1}
          onSelect={i => onCountChange(i + 1)}
          width={100}
        />
      </View>
    </View>
  );
}

function RepeatEndCustomPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (d: string | null) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatLocale();
  const { nonPastYmd } = useAppDateBounds();
  const [showPicker, setShowPicker] = useState(false);

  const formatDate = (d: string | null | undefined) => {
    if (!d) return t('modal.pickDate');
    const dt = ymdToDate(clampYmdNotBeforeYmd(d, nonPastYmd));
    return dt.toLocaleDateString(fmt, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const dateDate = (() => {
    if (value) return ymdToDate(clampYmdNotBeforeYmd(value, nonPastYmd));
    return ymdToDate(nonPastYmd);
  })();

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#1e293b' }}>
      <TouchableOpacity
        onPress={() => setShowPicker(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}
      >
        <Text style={{ color: '#94a3b8', fontSize: 15 }}>{t('modal.endDate')}</Text>
        <Text style={{ color: value ? 'white' : '#475569', fontSize: 15, fontWeight: '600' }}>
          {formatDate(value)}
        </Text>
      </TouchableOpacity>
      {showPicker && (
        <View>
          <DateTimePicker
            value={dateDate}
            mode="date"
            display="inline"
            themeVariant="dark"
            textColor="white"
            accentColor="#ec4899"
            minimumDate={ymdToDate(nonPastYmd)}
            onChange={(_, date) => {
              if (date) {
                const y = date.getFullYear();
                const mo = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                onChange(clampYmdNotBeforeYmd(`${y}-${mo}-${d}`, nonPastYmd));
                setShowPicker(false);
              }
            }}
            style={{ backgroundColor: 'transparent' }}
          />
        </View>
      )}
    </View>
  );
}

// Modal multipurpose: type=new|rename|schedule|color
export default function ModalScreen() {
  const { t } = useTranslation();
  const fmt = useFormatLocale();
  const { installMonthStartYmd: minSelectableYmd, nonPastYmd } = useAppDateBounds();
  const { width } = useWindowDimensions();
  const useCompactWeekdays = width <= 395;
  const { type = 'new', id, folder, ymd, initialText, lockTitle } = useLocalSearchParams<{ type?: string; id?: string; folder?: string; ymd?: string; initialText?: string; lockTitle?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const m = useModalLogic({ type, id, folder, ymd, initialText, lockTitle, scrollRef });
  const [places, setPlaces] = React.useState<{ id: string; name: string }[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = React.useState<string | null>(m.locationRule?.placeId ?? null);
  const [locationStatus, setLocationStatus] = React.useState<LocationPermissionStatus>('none');
  const [healthConnection, setHealthConnection] = React.useState<HealthConnectionInfo>({
    state: canUseHealthKit() ? 'unknown' : 'unsupported',
    requestStatus: null,
  });
  const [healthConnecting, setHealthConnecting] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [repeatEndOpen, setRepeatEndOpen] = React.useState(false);
  const [repeatSubOpen, setRepeatSubOpen] = React.useState(false);

  const [fromQuery, setFromQuery] = React.useState('');
  const [fromResults, setFromResults] = React.useState<CityInfo[]>([]);
  const [fromSearching, setFromSearching] = React.useState(false);
  const fromSelectedRef = React.useRef(false);
  const fromInputRef = React.useRef<TextInput>(null);
  const [fromConfirmed, setFromConfirmed] = React.useState(false);

  const [toQuery, setToQuery] = React.useState('');
  const [toResults, setToResults] = React.useState<CityInfo[]>([]);
  const [toSearching, setToSearching] = React.useState(false);
  const toSelectedRef = React.useRef(false);
  const toInputRef = React.useRef<TextInput>(null);
  const [toConfirmed, setToConfirmed] = React.useState(false);
  const healthFeatureEnabled = canUseHealthKit();
  const selectedHealthOption = getHealthHabitOption(m.healthMetric);
  const healthOptionsToShow = healthConnection.state === 'ready'
    ? HEALTH_HABIT_OPTIONS
    : (selectedHealthOption ? [selectedHealthOption] : []);
  const shouldShowSaluteDetails = m.tipo !== 'salute' || Boolean(m.healthMetric);
  const extraTypeOptions: ('vacanza' | 'salute')[] =
    healthFeatureEnabled || m.tipo === 'salute' ? ['vacanza', 'salute'] : ['vacanza'];

  const refreshHealthConnection = React.useCallback(async () => {
    try {
      const next = await getHealthConnectionStateAsync();
      setHealthConnection(next);
    } catch {
      setHealthConnection({
        state: canUseHealthKit() ? 'unknown' : 'unsupported',
        requestStatus: null,
      });
    }
  }, []);

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
    if ((type !== 'new' && type !== 'edit') || m.tipo !== 'salute') return;
    void refreshHealthConnection();
  }, [type, m.tipo, refreshHealthConnection]);

  React.useEffect(() => {
    if (fromSelectedRef.current) { fromSelectedRef.current = false; return; }
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
    if (toSelectedRef.current) { toSelectedRef.current = false; return; }
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

    const partenzaYmd = clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd);
    const ritornoYmd = clampYmdNotBeforeYmd(m.travelGiornoRitorno, partenzaYmd);
    const partenzaDate = parseYmdSafe(partenzaYmd);
    const ritornoDate = parseYmdSafe(ritornoYmd);
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
      m.setTravelGiornoRitorno(clampYmdNotBeforeYmd(formatYmd(nextY, nextM, nextD), minSelectableYmd));
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
      const currentRetDep = hhmmToMinutesSafe(m.travelOrarioPartenzaRitorno, 17 * 60);
      if (arriveOutMin > currentRetDep) {
        m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(arriveOutMin));
        m.setTravelPartenzaRitornoGiornoDopo(false);
        const retArr = arriveOutMin + 5;
        if (retArr >= 24 * 60) {
          m.setTravelArrivoRitornoGiornoDopo(true);
          m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr - 24 * 60));
        } else {
          m.setTravelArrivoRitornoGiornoDopo(false);
          m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(retArr));
        }
      }
      return;
    }

    if (!sameDayReturn && !nextDayReturnAfterOvernight) return;

    // Stesso giorno o giorno dopo con arrivo overnight: spinge avanti partenza/arrivo ritorno.
    // Se supera 23:55 → avanza giorno ritorno e riparte da 00:00.
    // Non intervenire se l'arrivo ritorno è già giorno dopo (l'utente sta modificando manualmente).
    if (m.travelArrivoRitornoGiornoDopo) return;

    const currentReturnDep = hhmmToMinutesSafe(m.travelOrarioPartenzaRitorno, 17 * 60);
    if (arriveOutMin >= currentReturnDep) {
      // Partenza ritorno = arrivo andata (stesso orario), arrivo ritorno = +5
      if (arriveOutMin >= 24 * 60) {
        const extraDays = Math.floor(arriveOutMin / (24 * 60));
        dRet.setDate(dRet.getDate() + extraDays);
        m.setTravelGiornoRitorno(clampYmdNotBeforeYmd(formatYmd(dRet.getFullYear(), dRet.getMonth() + 1, dRet.getDate()), minSelectableYmd));
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
    minSelectableYmd,
    nonPastYmd,
  ]);

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
          <View style={styles.box}>
          <Text style={styles.title}>
            {type === 'new'
              ? t('modal.titleNew')
              : type === 'rename'
                ? t('modal.titleRename')
                : type === 'schedule'
                  ? t('modal.titleSchedule')
                  : type === 'edit'
                    ? t('modal.titleEdit')
                    : t('modal.titleColor')}
          </Text>

          {(type === 'new' || type === 'rename' || type === 'edit') && !((m.tipo === 'viaggio' || m.tipo === 'salute' || m.tipo === 'vacanza') && (type === 'new' || type === 'edit')) && (
            <TextInput
              value={m.text}
              onChangeText={(v) => !m.isTextLocked && v.length <= 100 && m.setText(v)}
              onSubmitEditing={m.save}
              placeholder={t('modal.placeholderName')}
              placeholderTextColor="#64748b"
              editable={!m.isTextLocked}
              style={[styles.input, m.isTextLocked && { opacity: 0.75 }]}
            />
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionType')}</Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                {(['task', 'abitudine', 'evento', 'viaggio'] as const).map((tipoOpt) => (
                  <TouchableOpacity
                    key={tipoOpt}
                    onPress={() => m.setTipo(tipoOpt)}
                    style={[styles.chip, m.tipo === tipoOpt ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                  >
                    <Text style={m.tipo === tipoOpt ? styles.chipActiveText : styles.chipGhostText}>
                      {tipoOpt === 'task'
                        ? t('modal.tipoTask')
                        : tipoOpt === 'abitudine'
                        ? t('modal.tipoHabit')
                        : tipoOpt === 'evento'
                        ? t('modal.tipoEvent')
                        : t('modal.tipoTravel')}
                  </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.row, { marginTop: 8 }]}>
                {(['vacanza', 'avviso'] as const).map((tipoOpt) => (
                  <TouchableOpacity
                    key={tipoOpt}
                    onPress={() => {
                      if (!healthFeatureEnabled && tipoOpt === 'salute' && m.tipo !== 'salute') return;
                      m.setTipo(tipoOpt);
                    }}
                    style={[
                      styles.chip,
                      m.tipo === tipoOpt ? styles.chipActive : styles.chipGhost,
                      { paddingHorizontal: 16, paddingVertical: 8 },
                    ]}
                  >
                    <Text style={m.tipo === tipoOpt ? styles.chipActiveText : styles.chipGhostText}>
                      {tipoOpt === 'vacanza' ? t('modal.tipoVacation') : t('modal.tipoReminder')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!healthFeatureEnabled && (
                <Text style={[styles.subtle, { marginTop: 10 }]}>
                  {t('modal.healthDisabledBuild')}
                </Text>
              )}
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'salute' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionHealthMetric')}</Text>
              {healthConnection.state !== 'ready' && healthOptionsToShow.length === 0 ? (
                <View style={{ marginTop: 10, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a', gap: 10 }}>
                  <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>{t('modal.healthConnectTitle')}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 18 }}>
                    {t('modal.healthConnectSub')}
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        setHealthConnecting(true);
                        const granted = await requestHealthAuthorizationAsync();
                        await refreshHealthConnection();
                        if (!granted) {
                          Alert.alert(t('modal.healthPermissionTitle'), t('modal.healthPermissionBody'));
                        }
                      } catch {
                        Alert.alert(t('modal.healthErrorTitle'), t('modal.healthErrorBody'));
                      } finally {
                        setHealthConnecting(false);
                      }
                    }}
                    style={[styles.chip, styles.chipActive, { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, opacity: healthConnecting ? 0.6 : 1 }]}
                    disabled={healthConnecting}
                  >
                    <Text style={styles.chipActiveText}>{healthConnecting ? t('modal.healthConnecting') : t('modal.healthConnectCta')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {healthOptionsToShow.map((option) => {
                    const selected = m.healthMetric === option.metric;
                    return (
                      <TouchableOpacity
                        key={option.metric}
                        onPress={() => m.setHealthMetric(option.metric)}
                        activeOpacity={0.9}
                        style={{
                          borderRadius: 18,
                          overflow: 'hidden',
                          borderWidth: 2,
                          borderColor: selected ? '#ffffff' : 'rgba(148,163,184,0.22)',
                        }}
                      >
                        <LinearGradient
                          colors={[option.gradient[0], option.gradient[1]]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(15,23,42,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name={option.icon} size={18} color="white" />
                            </View>
                            <View>
                              <Text style={{ color: 'white', fontSize: 17, fontWeight: '800' }}>{option.label}</Text>
                              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
                                {option.metric === 'sleep'
                                  ? 'Monitora il sonno'
                                  : option.metric === 'steps'
                                  ? 'Conta i passi giornalieri'
                                  : option.metric === 'distance'
                                  ? 'Usa i km camminati o corsi'
                                  : 'Usa le calorie attive'}
                              </Text>
                            </View>
                          </View>
                          {selected && <Ionicons name="checkmark-circle" size={24} color="white" />}
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'salute' && m.healthMetric === 'sleep' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionSleepGoal')}</Text>
              <Text style={styles.subtle}>{t('modal.sleepGoalSub')}</Text>
              <View style={[styles.timePicker, { marginTop: 8 }]}>
                <View style={[styles.timeControls, { flex: 0, minWidth: 180 }]}>
                  <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                  <View style={styles.timeStepperRow}>
                    <HoldableStepperButton onPress={() => m.setHealthGoalHours((prev: number) => Math.max(1, prev - 1))}>−</HoldableStepperButton>
                    <Text style={styles.timeValue}>{m.healthGoalHours}</Text>
                    <HoldableStepperButton onPress={() => m.setHealthGoalHours((prev: number) => Math.min(16, prev + 1))}>+</HoldableStepperButton>
                  </View>
                </View>
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'salute' && m.healthMetric === 'steps' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionStepsGoal')}</Text>
              <Text style={styles.subtle}>{t('modal.stepsGoalSub')}</Text>
              <View style={[styles.timePicker, { marginTop: 8 }]}>
                <View style={[styles.timeControls, { flex: 0, minWidth: 220 }]}>
                  <Text style={styles.timeLabel}>{t('modal.stepsLabel')}</Text>
                  <View style={styles.timeStepperRow}>
                    <HoldableStepperButton onPress={() => m.setHealthGoalValue((prev: number) => Math.max(1000, prev - 1000))}>−</HoldableStepperButton>
                    <Text style={styles.timeValue}>{Math.round(m.healthGoalValue).toLocaleString(fmt)}</Text>
                    <HoldableStepperButton onPress={() => m.setHealthGoalValue((prev: number) => Math.min(50000, prev + 1000))}>+</HoldableStepperButton>
                  </View>
                </View>
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'salute' && m.healthMetric === 'distance' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionKmGoal')}</Text>
              <Text style={styles.subtle}>{t('modal.kmGoalSub')}</Text>
              <View style={[styles.timePicker, { marginTop: 8 }]}>
                <View style={[styles.timeControls, { flex: 0, minWidth: 200 }]}>
                  <Text style={styles.timeLabel}>{t('modal.kmLabel')}</Text>
                  <View style={styles.timeStepperRow}>
                    <HoldableStepperButton onPress={() => m.setHealthGoalValue((prev: number) => Math.max(0.5, Math.round((prev - 0.5) * 10) / 10))}>−</HoldableStepperButton>
                    <Text style={styles.timeValue}>{m.healthGoalValue.toLocaleString(fmt, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</Text>
                    <HoldableStepperButton onPress={() => m.setHealthGoalValue((prev: number) => Math.min(100, Math.round((prev + 0.5) * 10) / 10))}>+</HoldableStepperButton>
                  </View>
                </View>
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'salute' && m.healthMetric === 'activeEnergy' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionKcalGoal')}</Text>
              <Text style={styles.subtle}>{t('modal.kcalGoalSub')}</Text>
              <View style={[styles.timePicker, { marginTop: 8 }]}>
                <View style={[styles.timeControls, { flex: 0, minWidth: 220 }]}>
                  <Text style={styles.timeLabel}>{t('modal.kcalLabel')}</Text>
                  <View style={styles.timeStepperRow}>
                    <HoldableStepperButton onPress={() => m.setHealthGoalValue((prev: number) => Math.max(50, prev - 50))}>−</HoldableStepperButton>
                    <Text style={styles.timeValue}>{Math.round(m.healthGoalValue).toLocaleString(fmt)}</Text>
                    <HoldableStepperButton onPress={() => m.setHealthGoalValue((prev: number) => Math.min(5000, prev + 50))}>+</HoldableStepperButton>
                  </View>
                </View>
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionFolder')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => m.setSelectedFolder(null)}
                  style={[styles.chip, m.selectedFolder === null ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={m.selectedFolder === null ? styles.chipActiveText : styles.chipGhostText}>{t('common.tutte')}</Text>
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

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && m.tipo !== 'vacanza' && m.tipo !== 'salute' && (
            <View style={styles.colorBottom}>
              <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                <Text style={styles.sectionTitle}>{t('modal.sectionColor')}</Text>
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

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && m.tipo !== 'vacanza' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.sectionLabel')}</Text>
              <TextInput
                value={m.labelInput}
                onChangeText={m.setLabelInput}
                placeholder={t('modal.labelPlaceholder')}
                placeholderTextColor="#64748b"
                style={[styles.input, { marginTop: 8 }]}
              />
              {/* Suggerimenti autocomplete (quando sta scrivendo) */}
              {m.labelSuggestions.length > 0 && (
                <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {m.labelSuggestions.map(s => (
                    <TouchableOpacity
                      key={s.text}
                      onPress={() => m.setLabelInput(s.text)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a' }}
                    >
                      <Ionicons name="pricetag-outline" size={12} color="#94a3b8" style={{ marginRight: 5 }} />
                      <Text style={{ color: '#cbd5e1', fontSize: 13 }}>{s.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {/* Top 3 label più usate (quando il campo è vuoto) */}
              {m.labelInput.trim() === '' && m.topLabels.length > 0 && (
                <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
                  {m.topLabels.map(s => (
                    <TouchableOpacity
                      key={s.text}
                      onPress={() => m.setLabelInput(s.text)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a' }}
                    >
                      <Ionicons name="pricetag-outline" size={12} color="#94a3b8" style={{ marginRight: 5 }} />
                      <Text style={{ color: '#cbd5e1', fontSize: 13 }}>{s.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && (
            <View style={{ marginTop: 20 }}>
              <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => { if (m.notification.enabled) setNotifOpen(v => !v); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.sectionTitle}>{t('modal.sectionNotifications')}</Text>
                    {m.notification.enabled && (
                      <View style={{ marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={notifOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#94a3b8" />
                        {m.tipo === 'avviso' && (
                          <View style={{ width: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f43f5e' }}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>1</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
                <Switch
                  value={m.notification.enabled}
                  onValueChange={v => {
                    m.setNotification(
                      m.tipo === 'vacanza'
                        ? { ...m.notification, enabled: v, minutesBefore: null }
                        : { ...m.notification, enabled: v }
                    );
                    if (v) setNotifOpen(true); else setNotifOpen(false);
                  }}
                  trackColor={{ false: '#334155', true: '#ec4899' }}
                  thumbColor="white"
                />
              </View>
              {m.notification.enabled && notifOpen && (
                <View style={{ marginTop: 12, backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' }}>
                  {m.tipo === 'vacanza' ? (
                    <>
                      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                        <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>{t('modal.vacationNotifTitle')}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 4, marginBottom: 8 }}>
                          {t('modal.vacationNotifSub')}
                        </Text>
                      </View>
                      <NotificationCustomPicker
                        notification={{ ...m.notification, minutesBefore: null }}
                        setNotification={(next) => m.setNotification({ ...next, minutesBefore: null })}
                      />
                    </>
                  ) : m.tipo === 'avviso' ? (
                    <>
                      <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                        <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>{t('modal.reminderNotifTitle')}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                          {t('modal.reminderNotifSub')}
                        </Text>
                      </View>
                      {([
                        { label: t('modal.notifAtEvent'), value: 0 },
                        { label: t('modal.notif5'), value: 5 },
                        { label: t('modal.notif10'), value: 10 },
                        { label: t('modal.notif15'), value: 15 },
                        { label: t('modal.notif30'), value: 30 },
                        { label: t('modal.notif60'), value: 60 },
                        { label: t('modal.notif120'), value: 120 },
                        { label: t('modal.notifCustomTime'), value: null },
                      ] as { label: string; value: number | null }[]).map((opt, idx, arr) => {
                        const isSelected = m.notification.minutesBefore === opt.value;
                        return (
                          <TouchableOpacity
                            key={String(opt.value)}
                            onPress={() => m.setNotification({ ...m.notification, minutesBefore: opt.value, customTime: opt.value !== null ? null : m.notification.customTime, enabled: true })}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: '#1e293b' }}
                          >
                            <Text style={{ color: '#e2e8f0', fontSize: 15 }}>{opt.label}</Text>
                            {isSelected && <Ionicons name="checkmark" size={18} color="#ec4899" />}
                          </TouchableOpacity>
                        );
                      })}
                      {m.notification.minutesBefore === null && (
                        <NotificationCustomPicker notification={m.notification} setNotification={(next) => m.setNotification({ ...next, enabled: true, minutesBefore: null })} />
                      )}
                    </>
                  ) : (
                    <>
                      {([
                        { label: t('modal.notifAtEvent'), value: 0 },
                        { label: t('modal.notif5'), value: 5 },
                        { label: t('modal.notif10'), value: 10 },
                        { label: t('modal.notif15'), value: 15 },
                        { label: t('modal.notif30'), value: 30 },
                        { label: t('modal.notif60'), value: 60 },
                        { label: t('modal.notif120'), value: 120 },
                        { label: t('modal.notifCustomTime'), value: null },
                      ] as { label: string; value: number | null }[]).map((opt, idx, arr) => {
                        const isSelected = m.notification.minutesBefore === opt.value;
                        return (
                          <TouchableOpacity
                            key={String(opt.value)}
                            onPress={() => m.setNotification({ ...m.notification, minutesBefore: opt.value, customTime: opt.value !== null ? null : m.notification.customTime })}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: '#1e293b' }}
                          >
                            <Text style={{ color: '#e2e8f0', fontSize: 15 }}>{opt.label}</Text>
                            {isSelected && <Ionicons name="checkmark" size={18} color="#ec4899" />}
                          </TouchableOpacity>
                        );
                      })}
                      {m.notification.minutesBefore === null && (
                        <NotificationCustomPicker notification={m.notification} setNotification={m.setNotification} />
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && (m.tipo === 'task' || m.tipo === 'abitudine') && (
            <View style={{ marginTop: 20 }}>
              <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1, paddingRight: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.sectionTitle}>{t('modal.sectionSmartTask')}</Text>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        t('modal.smartTaskInfoTitle'),
                        t('modal.smartTaskInfoMessage'),
                        [{ text: t('common.ok'), style: 'default', isPreferred: true }],
                      )
                    }
                    style={{
                      marginLeft: 8,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: '#64748b',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700' }}>i</Text>
                  </TouchableOpacity>
                </View>
                <Switch
                  value={m.smartTaskEnabled}
                  onValueChange={m.setSmartTaskEnabled}
                  trackColor={{ false: '#334155', true: '#ec4899' }}
                  thumbColor="white"
                />
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && m.tipo !== 'viaggio' && m.tipo !== 'vacanza' && (
            <View style={{ marginTop: 20 }}>
              <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1, paddingRight: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.sectionTitle}>{t('modal.sectionPauseTravel')}</Text>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        t('modal.pauseTravelInfoTitle'),
                        t('modal.pauseTravelInfoMessage'),
                        [{ text: t('common.ok'), style: 'default', isPreferred: true }],
                      )
                    }
                    style={{
                      marginLeft: 8,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: '#64748b',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700' }}>i</Text>
                  </TouchableOpacity>
                </View>
                <Switch
                  value={m.pauseDuringTravel}
                  onValueChange={m.setPauseDuringTravel}
                  trackColor={{ false: '#334155', true: '#ec4899' }}
                  thumbColor="white"
                />
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && m.tipo !== 'viaggio' && m.tipo !== 'vacanza' && m.tipo !== 'avviso' && (
            <View style={{ marginTop: 20 }}>
              <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <Text style={styles.sectionTitle}>{t('modal.sectionAskReview')}</Text>
                <Switch
                  value={m.askReview}
                  onValueChange={v => m.setAskReview(v)}
                  trackColor={{ false: '#334155', true: '#ec4899' }}
                  thumbColor="white"
                />
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && (m.tipo === 'task' || m.tipo === 'abitudine') && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>{t('modal.timeLabel')}</Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                <TouchableOpacity
                  onPress={() => m.setTaskHasTime(false)}
                  style={[styles.chip, !m.taskHasTime ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={!m.taskHasTime ? styles.chipActiveText : styles.chipGhostText}>{t('modal.timeNone')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => m.setTaskHasTime(true)}
                  style={[styles.chip, m.taskHasTime ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={m.taskHasTime ? styles.chipActiveText : styles.chipGhostText}>{t('modal.timeTimed')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && m.tipo === 'viaggio' && (
            <View style={{ marginTop: 20 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('modal.sectionTravelDetails')}</Text>
              </View>

              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    ref={fromInputRef}
                    value={m.travelPartenzaTipo === 'attuale' ? (m.currentCityName ?? '') : m.travelPartenzaNome}
                    onChangeText={(v) => {
                      m.setTravelPartenzaNome(v);
                      setFromQuery(v);
                      setFromConfirmed(false);
                    }}
                    editable={m.travelPartenzaTipo !== 'attuale'}
                    placeholder={m.travelPartenzaTipo === 'attuale' ? t('modal.departurePlaceholderCurrent') : t('modal.departurePlaceholder')}
                    placeholderTextColor="#64748b"
                    style={[styles.input, { flex: 1, color: m.travelPartenzaTipo === 'attuale' ? '#9ca3af' : 'white' }]}
                  />
                  <TouchableOpacity
                    onPress={() => m.setTravelPartenzaTipo(m.travelPartenzaTipo === 'attuale' ? 'personalizzata' : 'attuale')}
                    style={[styles.chip, m.travelPartenzaTipo === 'attuale' ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 10 }]}
                  >
                    <Ionicons
                      name="navigate-outline"
                      size={18}
                      color={m.travelPartenzaTipo === 'attuale' ? '#fff' : '#9ca3af'}
                    />
                  </TouchableOpacity>
                </View>
                {fromSearching && m.travelPartenzaTipo !== 'attuale' && (
                  <Text style={[styles.subtle, { marginTop: 6 }]}>{t('modal.searchingCities')}</Text>
                )}
                {m.travelPartenzaTipo !== 'attuale' && !fromSearching && !fromConfirmed && fromQuery.trim().length >= 2 && fromResults.length === 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#0f172a', marginTop: 4 }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#64748b', fontSize: 14 }}>{t('modal.placeNotFound')}</Text>
                  </View>
                )}
                {m.travelPartenzaTipo !== 'attuale' && fromResults.map((city, idx) => (
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
                      fromSelectedRef.current = true;
                      setFromConfirmed(true);
                      m.setTravelPartenzaNome(city.name);
                      setFromQuery(city.name);
                      setFromResults([]);
                      fromInputRef.current?.blur();
                    }}
                  >
                    <Ionicons name="location-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#e5e7eb', fontSize: 14 }}>{city.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.row, { marginTop: 12, justifyContent: 'center' }]}>
                {([
                  { key: 'aereo', icon: 'airplane-outline' },
                  { key: 'treno', icon: 'train-outline' },
                  { key: 'auto', icon: 'car-outline' },
                  { key: 'nave', icon: 'boat-outline' },
                  { key: 'bici', icon: 'bicycle-outline' },
                  { key: 'bus', icon: 'bus-outline' },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => m.setTravelMezzo(opt.key)}
                    style={[styles.chip, m.travelMezzo === opt.key ? styles.chipActive : styles.chipGhost]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={18}
                      color={m.travelMezzo === opt.key ? '#fff' : '#9ca3af'}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 12 }}>
                <TextInput
                  ref={toInputRef}
                  value={m.travelDestinazioneNome}
                  onChangeText={(v) => {
                    m.setTravelDestinazioneNome(v);
                    setToQuery(v);
                    setToConfirmed(false);
                  }}
                  placeholder={t('modal.destinationPh')}
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                {toSearching && (
                  <Text style={[styles.subtle, { marginTop: 6 }]}>{t('modal.searchingCities')}</Text>
                )}
                {!toSearching && !toConfirmed && toQuery.trim().length >= 2 && toResults.length === 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#0f172a', marginTop: 4 }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#64748b', fontSize: 14 }}>{t('modal.placeNotFound')}</Text>
                  </View>
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
                      toSelectedRef.current = true;
                      setToConfirmed(true);
                      m.setTravelDestinazioneNome(city.name);
                      setToQuery(city.name);
                      setToResults([]);
                      toInputRef.current?.blur();
                    }}
                  >
                    <Ionicons name="location-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#e5e7eb', fontSize: 14 }}>{city.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(() => {
                const clampedYmd = clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd);
                const { year, month, day } = parseYmdSafe(clampedYmd);
                const isToday = compareYmd(clampedYmd, nonPastYmd) === 0;

                const applyAndSet = (nextYear: number, nextMonth: number, nextDay: number) => {
                  const fixed = clampYmdNotBeforeYmd(formatYmd(nextYear, nextMonth, nextDay), minSelectableYmd);
                  m.setTravelGiornoPartenza(fixed);
                };

                return (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.subtle}>{t('modal.departureDay')}</Text>
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
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.day')}</Text>
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
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.month')}</Text>
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
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.year')}</Text>
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
                    const pDate = parseYmdSafe(clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd));
                    const rDate = parseYmdSafe(clampYmdNotBeforeYmd(m.travelGiornoRitorno, minSelectableYmd));
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
                      m.setTravelGiornoRitorno(clampYmdNotBeforeYmd(formatYmd(dR.getFullYear(), dR.getMonth() + 1, dR.getDate()), minSelectableYmd));
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
                    const clamped = Math.max(0, Math.min(23 * 60 + 55, next));
                    m.setTravelOrarioPartenza(minutesToHhmmSafe(clamped));
                    if (!endIsNextDay) {
                      const safeEnd = Math.max(endMin, clamped + 5);
                      const capped = Math.min(safeEnd, 24 * 60 + (24 * 60 - 5));
                      if (capped >= 24 * 60) {
                        m.setTravelArrivoGiornoDopo(true);
                        m.setTravelOrarioArrivo(minutesToHhmmSafe(capped - 24 * 60));
                      } else {
                        m.setTravelArrivoGiornoDopo(false);
                        m.setTravelOrarioArrivo(minutesToHhmmSafe(capped));
                      }
                      if (capped !== endMin) pushReturnIfNeeded(capped);
                    }
                  };

                  const setEnd = (next: number) => {
                    const clamped = Math.max(5, Math.min(24 * 60 + (24 * 60 - 5), next));
                    if (clamped >= 24 * 60) {
                      m.setTravelArrivoGiornoDopo(true);
                      m.setTravelOrarioArrivo(minutesToHhmmSafe(clamped - 24 * 60));
                    } else {
                      m.setTravelArrivoGiornoDopo(false);
                      m.setTravelOrarioArrivo(minutesToHhmmSafe(clamped));
                    }
                    if (!endIsNextDay && clamped < startMin + 5) {
                      const newStart = Math.max(0, clamped - 5);
                      m.setTravelOrarioPartenza(minutesToHhmmSafe(newStart));
                    }
                    if (clamped > endMin) pushReturnIfNeeded(clamped);
                  };

                  const diff = endMin - startMin;
                  const durationLabel = diff > 0 ? formatDuration(diff) : '';

                  return (
                    <>
                      <View style={styles.timeColumn}>
                        <View style={styles.timeSection}>
                          <Text style={styles.timeSectionTitle}>{t('modal.travelDeparture')}</Text>
                          <View style={styles.timePicker}>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton onPress={() => setStart(startMin - 60)}>−</HoldableStepperButton>
                                <Text style={styles.timeValue}>{Math.floor(startMin / 60)}</Text>
                                <HoldableStepperButton onPress={() => setStart(startMin + 60)}>+</HoldableStepperButton>
                              </View>
                            </View>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>{t('common.min')}</Text>
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
                            {endIsNextDay ? t('modal.travelArrivalNext') : t('modal.travelArrival')}
                          </Text>
                          <View style={styles.timePicker}>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton onPress={() => setEnd(endMin - 60)}>−</HoldableStepperButton>
                                <Text style={styles.timeValue}>{Math.floor(endShown / 60)}</Text>
                                <HoldableStepperButton onPress={() => setEnd(endMin + 60)}>+</HoldableStepperButton>
                              </View>
                            </View>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>{t('common.min')}</Text>
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
                <Text style={styles.subtle}>{t('modal.returnDayOptional')}</Text>
                {!m.travelGiornoRitorno ? (
                  <TouchableOpacity
                    onPress={() => {
                      // Se l'arrivo dell'andata è marcato "giorno dopo",
                      // il giorno di ritorno parte già dal giorno successivo.
                      if (m.travelArrivoGiornoDopo) {
                        const partenza = parseYmdSafe(clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd));
                        const base = new Date(partenza.year, partenza.month - 1, partenza.day);
                        base.setDate(base.getDate() + 1);
                        const nextYmd = clampYmdNotBeforeYmd(formatYmd(base.getFullYear(), base.getMonth() + 1, base.getDate()), minSelectableYmd);
                        m.setTravelGiornoRitorno(nextYmd);
                      } else {
                        m.setTravelGiornoRitorno(clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd));
                      }
                    }}
                    style={[styles.chip, styles.chipGhost, { marginTop: 8, alignSelf: 'flex-start' }]}
                  >
                    <Text style={styles.chipGhostText}>{t('modal.addReturnDay')}</Text>
                  </TouchableOpacity>
                ) : (
                  (() => {
                    const parsedYmd = clampYmdNotBeforeYmd(m.travelGiornoRitorno, minSelectableYmd);
                    const partenzaYmd = clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd);
                    const partenzaParsed = parseYmdSafe(partenzaYmd);
                    const baseMinDate = new Date(partenzaParsed.year, partenzaParsed.month - 1, partenzaParsed.day);
                    // Se l'arrivo dell'andata è "giorno dopo", il minimo ritorno è dal giorno successivo.
                    if (m.travelArrivoGiornoDopo) {
                      baseMinDate.setDate(baseMinDate.getDate() + 1);
                    }
                    const baseMinYmd = formatYmd(baseMinDate.getFullYear(), baseMinDate.getMonth() + 1, baseMinDate.getDate());
                    const effectiveMinYmd = compareYmd(baseMinYmd, minSelectableYmd) > 0 ? baseMinYmd : minSelectableYmd;
                    const clampedYmd = clampYmdNotBeforeYmd(parsedYmd, effectiveMinYmd);
                    const { year, month, day } = parseYmdSafe(clampedYmd);
                    const isToday = compareYmd(clampedYmd, nonPastYmd) === 0;
                    const applyAndSet = (nextYear: number, nextMonth: number, nextDay: number) => {
                      const fixed = clampYmdNotBeforeYmd(formatYmd(nextYear, nextMonth, nextDay), effectiveMinYmd);
                      m.setTravelGiornoRitorno(fixed);
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
                            <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.day')}</Text>
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
                            <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.month')}</Text>
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
                            <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.year')}</Text>
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
                            const partenzaDate = parseYmdSafe(clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd));
                            const ritornoDate = m.travelGiornoRitorno
                              ? parseYmdSafe(clampYmdNotBeforeYmd(m.travelGiornoRitorno, minSelectableYmd))
                              : partenzaDate;
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
                              const clamped = Math.max(lowerBound, Math.min(23 * 60 + 55, next));
                              if (clamped === startMinR) return;
                              m.setTravelPartenzaRitornoGiornoDopo(false);
                              m.setTravelOrarioPartenzaRitorno(minutesToHhmmSafe(clamped));
                              if (!endIsNextDayR && clamped > endMinR - 5) {
                                const newEnd = clamped + (endMinR - startMinR);
                                if (newEnd >= 24 * 60) {
                                  m.setTravelArrivoRitornoGiornoDopo(true);
                                  m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(newEnd - 24 * 60));
                                } else {
                                  m.setTravelArrivoRitornoGiornoDopo(false);
                                  m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(newEnd));
                                }
                              }
                            };

                            const setEndR = (next: number) => {
                              const clamped = Math.max(5, Math.min(24 * 60 + (24 * 60 - 5), next));
                              if (!endIsNextDayR && clamped < endMinR) {
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
                                      {t('modal.travelReturnDeparture')}
                                    </Text>
                                    <View style={styles.timePicker}>
                                      <View style={styles.timeControls}>
                                        <Text style={styles.timeLabel}>{t('common.ore')}</Text>
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
                                        <Text style={styles.timeLabel}>{t('common.min')}</Text>
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
                                      {endIsNextDayR ? t('modal.travelReturnArrivalNext') : t('modal.travelReturnArrival')}
                                    </Text>
                                    <View style={styles.timePicker}>
                                      <View style={styles.timeControls}>
                                        <Text style={styles.timeLabel}>{t('common.ore')}</Text>
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
                                        <Text style={styles.timeLabel}>{t('common.min')}</Text>
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

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && m.tipo === 'vacanza' && (
            <View style={{ marginTop: 20 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('modal.vacationRange')}</Text>
              </View>

              {(() => {
                const startYmd = clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd);
                const endYmd = clampYmdNotBeforeYmd(m.travelGiornoRitorno ?? m.travelGiornoPartenza, startYmd);
                const startDate = parseYmdSafe(startYmd);
                const endDate = parseYmdSafe(endYmd);
                const startDateLabel = new Date(startDate.year, startDate.month - 1, startDate.day);
                const endDateLabel = new Date(endDate.year, endDate.month - 1, endDate.day);
                const startMinutes = hhmmToMinutesSafe(m.travelOrarioPartenza, 9 * 60);
                const endMinutes = hhmmToMinutesSafe(m.travelOrarioArrivoRitorno ?? m.travelOrarioArrivo, 18 * 60);
                const sameDay = startYmd === endYmd;
                const isStartToday = compareYmd(startYmd, nonPastYmd) === 0;
                const isEndToday = compareYmd(endYmd, nonPastYmd) === 0;

                const setStartDate = (delta: number) => {
                  const next = clampYmdNotBeforeYmd(shiftYmd(startYmd, delta), minSelectableYmd);
                  m.setTravelGiornoPartenza(next);
                  if (compareYmd(endYmd, next) < 0) m.setTravelGiornoRitorno(next);
                };

                const setStartMonth = (delta: number) => {
                  const next = clampYmdNotBeforeYmd(shiftYmdByMonths(startYmd, delta), minSelectableYmd);
                  m.setTravelGiornoPartenza(next);
                  if (compareYmd(endYmd, next) < 0) m.setTravelGiornoRitorno(next);
                };

                const setStartYear = (delta: number) => {
                  const next = clampYmdNotBeforeYmd(shiftYmdByYears(startYmd, delta), minSelectableYmd);
                  m.setTravelGiornoPartenza(next);
                  if (compareYmd(endYmd, next) < 0) m.setTravelGiornoRitorno(next);
                };

                const setEndDate = (delta: number) => {
                  const next = clampYmdNotBeforeYmd(shiftYmd(endYmd, delta), startYmd);
                  if (compareYmd(next, startYmd) < 0) {
                    m.setTravelGiornoRitorno(startYmd);
                    return;
                  }
                  m.setTravelGiornoRitorno(next);
                };

                const setEndMonth = (delta: number) => {
                  const next = clampYmdNotBeforeYmd(shiftYmdByMonths(endYmd, delta), startYmd);
                  if (compareYmd(next, startYmd) < 0) {
                    m.setTravelGiornoRitorno(startYmd);
                    return;
                  }
                  m.setTravelGiornoRitorno(next);
                };

                const setEndYear = (delta: number) => {
                  const next = clampYmdNotBeforeYmd(shiftYmdByYears(endYmd, delta), startYmd);
                  if (compareYmd(next, startYmd) < 0) {
                    m.setTravelGiornoRitorno(startYmd);
                    return;
                  }
                  m.setTravelGiornoRitorno(next);
                };

                const setStartTime = (next: number) => {
                  const clamped = Math.max(0, Math.min(23 * 60 + 55, next));
                  m.setTravelOrarioPartenza(minutesToHhmmSafe(clamped));
                  if (sameDay && clamped >= endMinutes - 5) {
                    m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(Math.min(24 * 60, clamped + 60)));
                  }
                };

                const setEndTime = (next: number) => {
                  const clamped = Math.max(5, Math.min(24 * 60, next));
                  const adjusted = sameDay ? Math.max(clamped, startMinutes + 5) : clamped;
                  m.setTravelOrarioArrivoRitorno(minutesToHhmmSafe(adjusted));
                  m.setTravelOrarioArrivo(minutesToHhmmSafe(adjusted));
                };

                return (
                  <>
                    <View
                      style={{
                        marginTop: 8,
                        backgroundColor: '#0f172a',
                        borderRadius: 18,
                        borderWidth: isStartToday ? 2 : 1,
                        borderColor: isStartToday ? '#ef4444' : '#334155',
                        padding: 16,
                      }}
                    >
                      <Text style={styles.subtle}>{t('modal.vacationStartDate')}</Text>
                      <View style={{ marginTop: 12, gap: 12 }}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.day')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <HoldableStepperButton onPress={() => setStartDate(-1)}>−</HoldableStepperButton>
                            <View
                              style={{
                                minWidth: 96,
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 14,
                              }}
                            >
                              <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{startDate.day}</Text>
                            </View>
                            <HoldableStepperButton onPress={() => setStartDate(1)}>+</HoldableStepperButton>
                          </View>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.month')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <HoldableStepperButton onPress={() => setStartMonth(-1)}>−</HoldableStepperButton>
                            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', minWidth: 96, textAlign: 'center', paddingVertical: 8 }}>
                              {startDateLabel.toLocaleDateString(fmt, { month: 'long' })}
                            </Text>
                            <HoldableStepperButton onPress={() => setStartMonth(1)}>+</HoldableStepperButton>
                          </View>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.year')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <HoldableStepperButton onPress={() => setStartYear(-1)}>−</HoldableStepperButton>
                            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', minWidth: 96, textAlign: 'center', paddingVertical: 8 }}>
                              {startDate.year}
                            </Text>
                            <HoldableStepperButton onPress={() => setStartYear(1)}>+</HoldableStepperButton>
                          </View>
                        </View>
                      </View>
                      <View style={{ marginTop: 18 }}>
                        <Text style={styles.timeSectionTitle}>{t('modal.departureTime')}</Text>
                        <View style={styles.timePicker}>
                          <View style={styles.timeControls}>
                            <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                            <View style={styles.timeStepperRow}>
                              <HoldableStepperButton onPress={() => setStartTime(startMinutes - 60)}>−</HoldableStepperButton>
                              <Text style={styles.timeValue}>{String(Math.floor(startMinutes / 60)).padStart(2, '0')}</Text>
                              <HoldableStepperButton onPress={() => setStartTime(startMinutes + 60)}>+</HoldableStepperButton>
                            </View>
                          </View>
                          <View style={styles.timeControls}>
                            <Text style={styles.timeLabel}>{t('common.min')}</Text>
                            <View style={styles.timeStepperRow}>
                              <HoldableStepperButton onPress={() => setStartTime(startMinutes - 5)}>−</HoldableStepperButton>
                              <Text style={styles.timeValue}>{String(startMinutes % 60).padStart(2, '0')}</Text>
                              <HoldableStepperButton onPress={() => setStartTime(startMinutes + 5)}>+</HoldableStepperButton>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View
                      style={{
                        marginTop: 16,
                        backgroundColor: '#0f172a',
                        borderRadius: 18,
                        borderWidth: isEndToday ? 2 : 1,
                        borderColor: isEndToday ? '#ef4444' : '#334155',
                        padding: 16,
                      }}
                    >
                      <Text style={styles.subtle}>{t('modal.vacationEndDate')}</Text>
                      <View style={{ marginTop: 12, gap: 12 }}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.day')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <HoldableStepperButton onPress={() => setEndDate(-1)}>−</HoldableStepperButton>
                            <View
                              style={{
                                minWidth: 96,
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 14,
                              }}
                            >
                              <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{endDate.day}</Text>
                            </View>
                            <HoldableStepperButton onPress={() => setEndDate(1)}>+</HoldableStepperButton>
                          </View>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.month')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <HoldableStepperButton onPress={() => setEndMonth(-1)}>−</HoldableStepperButton>
                            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', minWidth: 96, textAlign: 'center', paddingVertical: 8 }}>
                              {endDateLabel.toLocaleDateString(fmt, { month: 'long' })}
                            </Text>
                            <HoldableStepperButton onPress={() => setEndMonth(1)}>+</HoldableStepperButton>
                          </View>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.year')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <HoldableStepperButton onPress={() => setEndYear(-1)}>−</HoldableStepperButton>
                            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', minWidth: 96, textAlign: 'center', paddingVertical: 8 }}>
                              {endDate.year}
                            </Text>
                            <HoldableStepperButton onPress={() => setEndYear(1)}>+</HoldableStepperButton>
                          </View>
                        </View>
                      </View>
                      <View style={{ marginTop: 18 }}>
                        <Text style={styles.timeSectionTitle}>{t('modal.returnTime')}</Text>
                        <View style={styles.timePicker}>
                          <View style={styles.timeControls}>
                            <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                            <View style={styles.timeStepperRow}>
                              <HoldableStepperButton onPress={() => setEndTime(endMinutes - 60)}>−</HoldableStepperButton>
                              <Text style={styles.timeValue}>{String(Math.floor(endMinutes / 60)).padStart(2, '0')}</Text>
                              <HoldableStepperButton onPress={() => setEndTime(endMinutes + 60)}>+</HoldableStepperButton>
                            </View>
                          </View>
                          <View style={styles.timeControls}>
                            <Text style={styles.timeLabel}>{t('common.min')}</Text>
                            <View style={styles.timeStepperRow}>
                              <HoldableStepperButton onPress={() => setEndTime(endMinutes - 5)}>−</HoldableStepperButton>
                              <Text style={styles.timeValue}>{String(endMinutes % 60).padStart(2, '0')}</Text>
                              <HoldableStepperButton onPress={() => setEndTime(endMinutes + 5)}>+</HoldableStepperButton>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>
          )}

          {shouldShowSaluteDetails && (m.tipo !== 'viaggio' && m.tipo !== 'vacanza') && (type === 'schedule' || ((type === 'new' || type === 'edit') && ((m.tipo !== 'task' && m.tipo !== 'abitudine') || m.taskHasTime))) && (
            <View>
              <>
                  {/* Giorno / Data inizio: sempre visibile sopra Ripetizione */}
                  <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                    <Text style={styles.sectionTitle}>
                      {m.freq === 'single'
                        ? t('modal.dateSpecificDay')
                        : m.freq === 'annual'
                          ? t('modal.dateAnnualDay')
                          : t('modal.dateStartRepeat')}
                    </Text>
                  </View>
                  <View style={[
                    {
                      flexDirection: 'row',
                      gap: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      borderWidth: 2,
                      borderRadius: 12,
                      padding: 8,
                      borderColor: 'transparent',
                    },
                    m.isToday && { borderColor: '#ff3b30' }
                  ]}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.day')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HoldableStepperButton onPress={() => (m.setAnnualDayClamped ?? m.setAnnualDay)(d => Math.max(1, d - 1))}>−</HoldableStepperButton>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualDay}</Text>
                        <HoldableStepperButton onPress={() => (m.setAnnualDayClamped ?? m.setAnnualDay)(d => Math.min(31, d + 1))}>+</HoldableStepperButton>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.month')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HoldableStepperButton onPress={() => (m.setAnnualMonthClamped ?? m.setAnnualMonth)(prev => Math.max(1, prev - 1))}>−</HoldableStepperButton>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualMonth}</Text>
                        <HoldableStepperButton onPress={() => (m.setAnnualMonthClamped ?? m.setAnnualMonth)(prev => Math.min(12, prev + 1))}>+</HoldableStepperButton>
                      </View>
                    </View>
                    {m.freq !== 'annual' && (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>{t('common.year')}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <HoldableStepperButton onPress={() => (m.setAnnualYearClamped ?? m.setAnnualYear)(y => y - 1)}>−</HoldableStepperButton>
                          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{m.annualYear}</Text>
                          <HoldableStepperButton onPress={() => (m.setAnnualYearClamped ?? m.setAnnualYear)(y => y + 1)}>+</HoldableStepperButton>
                        </View>
                      </View>
                    )}
                  </View>

                  <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>{t('modal.sectionRepeat')}</Text></View>
                  <View style={styles.row}>
                    <TouchableOpacity onPress={() => m.setFreqWithConfirmation('single')} style={[styles.chip, m.freq === 'single' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'single' ? styles.chipActiveText : styles.chipGhostText}>{t('modal.freqSingle')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => m.setFreqWithConfirmation('daily')} style={[styles.chip, m.freq === 'daily' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'daily' ? styles.chipActiveText : styles.chipGhostText}>{t('modal.freqDaily')}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.row, { marginTop: 8 }]}>
                    <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('weekly'); }} style={[styles.chip, m.freq === 'weekly' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'weekly' ? styles.chipActiveText : styles.chipGhostText}>{t('modal.freqWeekly')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('monthly'); }} style={[styles.chip, m.freq === 'monthly' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'monthly' ? styles.chipActiveText : styles.chipGhostText}>{t('modal.freqMonthly')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('annual'); }} style={[styles.chip, m.freq === 'annual' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.freq === 'annual' ? styles.chipActiveText : styles.chipGhostText}>{t('modal.freqAnnual')}</Text>
                    </TouchableOpacity>
                  </View>

                  {m.freq === 'weekly' && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.subtle}>{t('modal.weekdaysPick')}</Text>
                      <View style={[styles.daysWrap, useCompactWeekdays && styles.daysWrapCompact]}>
                        {(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] as const).map((dowKey, i) => {
                          const sundayIndex = (i + 1) % 7; // map Mon->1 ... Sun->0
                          const selected = m.daysOfWeek.includes(sundayIndex);
                          return (
                            <TouchableOpacity
                              key={i}
                              onPress={() => m.toggleDow(sundayIndex)}
                              style={[
                                styles.dayPill,
                                useCompactWeekdays && styles.dayPillCompact,
                                selected ? styles.dayPillOn : styles.dayPillOff,
                              ]}
                            >
                              <Text style={selected ? styles.dayTextOn : styles.dayTextOff}>{t(`weekdaysShort.${dowKey}`)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {m.freq === 'monthly' && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.subtle}>{t('modal.monthDaysPick')}</Text>
                      <View style={styles.monthlyDaysWrap}>
                        {Array.from({ length: 31 }).map((_, i) => (
                          <TouchableOpacity key={i} onPress={() => m.toggleMonthDay(i + 1)} style={[styles.monthlyDayPill, m.monthDays.includes(i + 1) ? styles.dayPillOn : styles.dayPillOff]}>
                            <Text style={m.monthDays.includes(i + 1) ? styles.dayTextOn : styles.dayTextOff}>{i + 1}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>

              {m.freq !== 'single' && (
                <View style={{ marginTop: 16 }}>
                  <TouchableOpacity onPress={() => setRepeatEndOpen(v => !v)} style={[styles.sectionHeader, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.sectionTitle}>{t('modal.repeatEnd')}</Text>
                      <Ionicons name={repeatEndOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#94a3b8" style={{ marginLeft: 6 }} />
                    </View>
                    <View style={{ marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,0.12)' }}>
                      <Text style={{ color: '#ec4899', fontSize: 13, fontWeight: '600' }}>
                        {m.repeatEndType === 'mai'
                          ? t('modal.repeatNever')
                          : m.repeatEndType === 'durata'
                            ? t('modal.repeatAfterCount', {
                                count: m.repeatEndCount,
                                unit:
                                  m.freq === 'daily'
                                    ? t('modal.unitDays')
                                    : m.freq === 'weekly'
                                      ? t('modal.unitWeeks')
                                      : m.freq === 'monthly'
                                        ? t('modal.unitMonths')
                                        : t('modal.unitYears'),
                              })
                            : m.repeatEndCustomDate
                              ? (() => {
                                  const [y, mo, d] = m.repeatEndCustomDate!.split('-');
                                  return t('modal.customDateBadge', { d: parseInt(d, 10), m: parseInt(mo, 10), y });
                                })()
                              : t('modal.repeatCustomDate')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {repeatEndOpen && <View style={{ marginTop: 12, backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' }}>
                    {([
                      { label: t('modal.repeatNever'), value: 'mai' as const },
                      { label: t('modal.repeatAfter'), value: 'durata' as const },
                      { label: t('modal.repeatCustomDate'), value: 'personalizzata' as const },
                    ]).map((opt, idx, arr) => {
                      const isSelected = m.repeatEndType === opt.value;
                      const hasSubPicker = isSelected && opt.value !== 'mai' && repeatSubOpen;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => { m.setRepeatEndType(opt.value); if (opt.value !== 'mai') setRepeatSubOpen(true); else setRepeatSubOpen(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: (idx < arr.length - 1 || hasSubPicker) ? 1 : 0, borderBottomColor: '#1e293b' }}
                        >
                          <Text style={{ color: '#e2e8f0', fontSize: 15 }}>{opt.label}</Text>
                          {isSelected && <Ionicons name="checkmark" size={18} color="#ec4899" />}
                        </TouchableOpacity>
                      );
                    })}
                    {m.repeatEndType === 'durata' && repeatSubOpen && (
                      <RepeatEndDurationPicker
                        count={m.repeatEndCount}
                        unitLabel={
                          m.freq === 'daily'
                            ? t('modal.unitDays')
                            : m.freq === 'weekly'
                              ? t('modal.unitWeeks')
                              : m.freq === 'monthly'
                                ? t('modal.unitMonths')
                                : t('modal.unitYears')
                        }
                        onCountChange={m.setRepeatEndCount}
                      />
                    )}
                    {m.repeatEndType === 'personalizzata' && repeatSubOpen && (
                      <RepeatEndCustomPicker
                        value={m.repeatEndCustomDate}
                        onChange={m.setRepeatEndCustomDate}
                      />
                    )}
                  </View>}
                </View>
              )}

              {m.tipo !== 'avviso' && (
                <>
                  <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>{t('modal.timeLabel')}</Text></View>
                  <View style={styles.row}>
                    <TouchableOpacity onPress={() => m.setModeWithConfirmation('allDay')} style={[styles.chip, m.mode === 'allDay' ? styles.chipActive : styles.chipGhost]}>
                      <Text style={m.mode === 'allDay' ? styles.chipActiveText : styles.chipGhostText}>{t('modal.allDay')}</Text>
                    </TouchableOpacity>
                    {m.tipo !== 'salute' && (
                      <TouchableOpacity onPress={() => m.setModeWithConfirmation('timed')} style={[styles.chip, m.mode === 'timed' ? styles.chipActive : styles.chipGhost]}>
                        <Text style={m.mode === 'timed' ? styles.chipActiveText : styles.chipGhostText}>{t('modal.specificTime')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}

              {(m.tipo === 'avviso' || m.mode === 'timed') && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>{t('modal.timeLabel')}</Text>
                  {m.freq === 'weekly' && m.daysOfWeek.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>{t('modal.selectedDays')}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {([1,2,3,4,5,6,0] as number[]).filter(d => m.daysOfWeek.includes(d)).map(d => {
                          const shortKeys = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'] as const;
                          const label = t(`weekdaysShort.${shortKeys[d]}`);
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
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>{t('modal.selectedMonthDays')}</Text>
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
                      <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center', minHeight: 24 }}>
                        <Text style={styles.timeSectionTitle}>{t('modal.timeStart')}</Text>
                        {m.weekCustomTimeOverride && (
                          <TouchableOpacity
                            onPress={() => {
                              const { year, month, day } = parseYmdSafe(m.weekCustomTimeOverride.ymd);
                              m.setAnnualYear(year);
                              m.setAnnualMonth(month);
                              m.setAnnualDay(day);
                            }}
                            style={{
                              position: 'absolute',
                              right: 0,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: 'rgba(245,158,11,0.18)',
                              borderWidth: 1,
                              borderColor: 'rgba(245,158,11,0.5)',
                            }}
                          >
                            <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>
                              {(() => {
                                const { year, day, month } = parseYmdSafe(m.weekCustomTimeOverride.ymd);
                                return t('modal.customDateBadge', { d: day, m: month, y: String(year).slice(-2) });
                              })()}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    <View style={styles.timePicker}>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                          <View style={styles.timeStepperRow}>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              const newStartMin = Math.max(0, curS - 60);
                              m.updateCurrentTimeRange(newStartMin, curE);
                            }}>−</HoldableStepperButton>
                            <Text style={styles.timeValue}>{Math.floor(m.currentStartMin / 60)}</Text>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              const newStartMin = Math.min(23 * 60 + 55, curS + 60);
                              const newEndMin = curE != null && curE - curS === 60 ? newStartMin + 60 : curE;
                              m.updateCurrentTimeRange(newStartMin, newEndMin);
                            }}>+</HoldableStepperButton>
                          </View>
                        </View>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>{t('common.min')}</Text>
                          <View style={styles.timeStepperRow}>
                            <HoldableStepperButton
                              onPress={() => {
                                const curS = m.currentStartMin;
                                const curE = m.currentEndMin ?? curS + 60;
                                const newS = Math.max(0, curS - 5);
                                if (curE > curS + 5) {
                                  m.updateCurrentStartMin(newS);
                                } else {
                                  m.updateCurrentTimeRange(newS, curE - 5);
                                }
                              }}
                            >
                              −
                            </HoldableStepperButton>
                            <Text style={styles.timeValue}>{m.currentStartMin % 60}</Text>
                            <HoldableStepperButton onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              const newStartMin = Math.min(23 * 60 + 55, curS + 5);
                              m.updateCurrentStartMin(newStartMin);
                              if (curE != null) {
                                if (newStartMin < curE) {
                                  m.updateCurrentEndMin(curE);
                                } else {
                                  m.updateCurrentEndMin(Math.min(24 * 60, newStartMin + 5));
                                }
                              }
                            }}>+</HoldableStepperButton>
                          </View>
                        </View>
                      </View>
                    </View>
                    {m.tipo !== 'avviso' && (
                      <>
                        <View style={styles.timeSection}>
                          <Text style={styles.timeSectionTitle}>{t('modal.timeEnd')}</Text>
                          <View style={styles.timePicker}>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton onPress={() => {
                                  const curS = m.currentStartMin;
                                  const curE = m.currentEndMin;
                                  const newEndMin = (curE ?? curS + 60) - 60;
                                  if (curE != null && curE - curS === 60) {
                                    const nextStartMin = Math.max(0, newEndMin - 60);
                                    m.updateCurrentTimeRange(nextStartMin, newEndMin);
                                  } else {
                                    m.updateCurrentEndMin(newEndMin);
                                  }
                                }}>−</HoldableStepperButton>
                                <Text style={styles.timeValue}>{Math.floor(((m.currentEndMin ?? (m.currentStartMin + 60)) / 60))}</Text>
                                <HoldableStepperButton onPress={() => {
                                  const curS = m.currentStartMin;
                                  const curE = m.currentEndMin;
                                  const newEndMin = Math.min(24 * 60, (curE ?? curS + 60) + 60);
                                  if (curE != null && curE - curS === 60) {
                                    const nextStartMin = Math.max(0, newEndMin - 60);
                                    m.updateCurrentTimeRange(nextStartMin, newEndMin);
                                  } else {
                                    m.updateCurrentEndMin(newEndMin);
                                  }
                                }}>+</HoldableStepperButton>
                              </View>
                            </View>
                            <View style={styles.timeControls}>
                              <Text style={styles.timeLabel}>{t('common.min')}</Text>
                              <View style={styles.timeStepperRow}>
                                <HoldableStepperButton
                                  onPress={() => {
                                    const curS = m.currentStartMin;
                                    const curE = m.currentEndMin ?? curS + 60;
                                    const newE = curE - 5;
                                    if (newE >= curS + 5) {
                                      m.updateCurrentEndMin(newE);
                                    } else {
                                      m.updateCurrentTimeRange(curS - 5, curE - 5);
                                    }
                                  }}
                                >
                                  −
                                </HoldableStepperButton>
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
                        <Text style={styles.duration}>{formatDuration((m.currentEndMin ?? (m.currentStartMin + 60)) - m.currentStartMin)}</Text>
                        <View style={styles.timeSection}>
                      <Text style={styles.timeSectionTitle}>{t('modal.repetitions')}</Text>
                      <View style={[styles.timePicker, { justifyContent: 'center' }]}>
                        <View style={[styles.timeControls, { flex: 0, minWidth: 160 }]}>
                          <Text style={styles.timeLabel}>{t('modal.timesPerDay')}</Text>
                          <View style={styles.timeStepperRow}>
                            <HoldableStepperButton onPress={() => m.updateCurrentDailyOccurrences(Math.max(1, m.currentDailyOccurrences - 1))}>−</HoldableStepperButton>
                            <Text style={styles.timeValue}>{m.currentDailyOccurrences}</Text>
                            <HoldableStepperButton onPress={() => m.updateCurrentDailyOccurrences(Math.min(30, m.currentDailyOccurrences + 1))}>+</HoldableStepperButton>
                          </View>
                        </View>
                      </View>
                    </View>
                      {m.currentDailyOccurrences > 1 && (() => {
                        const sgi = m.slotGapInfo;
                        const displayGap = sgi.kind === 'uniform' ? sgi.gap : m.currentGapMinutes;
                        const isCustom = sgi.kind === 'custom';
                        return (
                          <View style={styles.timeSection}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={styles.timeSectionTitle}>{t('modal.gapTitle')}</Text>
                              {isCustom && (
                                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.18)', borderWidth: 1, borderColor: '#f59e0b' }}>
                                  <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>{t('common.custom')}</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.timePicker}>
                              <View style={styles.timeControls}>
                                <Text style={styles.timeLabel}>{t('common.ore')}</Text>
                                <View style={styles.timeStepperRow}>
                                  <HoldableStepperButton onPress={() => m.updateCurrentGapMinutes((g: number) => Math.max(5, Math.min(24 * 60, g - 60)))}>−</HoldableStepperButton>
                                  <Text style={styles.timeValue}>{Math.floor(displayGap / 60)}</Text>
                                  <HoldableStepperButton onPress={() => m.updateCurrentGapMinutes((g: number) => Math.max(5, Math.min(24 * 60, g + 60)))}>+</HoldableStepperButton>
                                </View>
                              </View>
                              <View style={styles.timeControls}>
                                <Text style={styles.timeLabel}>{t('common.min')}</Text>
                                <View style={styles.timeStepperRow}>
                                  <HoldableStepperButton onPress={() => m.updateCurrentGapMinutes((g: number) => Math.max(5, Math.min(24 * 60, g - 5)))}>−</HoldableStepperButton>
                                  <Text style={styles.timeValue}>{displayGap % 60}</Text>
                                  <HoldableStepperButton onPress={() => m.updateCurrentGapMinutes((g: number) => Math.max(5, Math.min(24 * 60, g + 5)))}>+</HoldableStepperButton>
                                </View>
                              </View>
                            </View>
                            {isCustom && (
                              <Text style={[styles.subtle, { marginTop: 4, textAlign: 'center', fontSize: 11, color: '#f59e0b' }]}>
                                {t('modal.gapResetHint')}
                              </Text>
                            )}
                            <Text style={[styles.subtle, { marginTop: 6, textAlign: 'center', fontSize: 11 }]}>
                              {m.occurrencePreviewSlots.join('  ·  ')}
                            </Text>
                          </View>
                        );
                      })()}
                      </>
                    )}
                  </View>
                  <Text style={[styles.subtle, { marginTop: 8, textAlign: 'center', fontSize: 12 }]}>
                    {t('modal.occurrenceHint')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {(type === 'new' || type === 'edit') && shouldShowSaluteDetails && m.tipo === 'task' && (
            <View style={{ marginTop: 20 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('modal.sectionLocationAuto')}</Text>
              </View>
              {(!canAskLocationPermission() || locationStatus === 'denied' || locationStatus === 'none') && (
                <Text style={styles.subtle}>
                  {t('modal.locationAutoDenied')}
                </Text>
              )}
              {canAskLocationPermission() && locationStatus !== 'denied' && (
                <>
                  {places.length === 0 ? (
                    <Text style={styles.subtle}>
                      {t('modal.locationAutoNoPlaces')}
                    </Text>
                  ) : (
                    <>
                      <Text style={[styles.subtle, { marginTop: 6 }]}>
                        {t('modal.locationAutoPick')}
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
                            {t('modal.noAutomation')}
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
          {(() => {
            const travelIncomplete = (type === 'new' || type === 'edit') && m.tipo === 'viaggio' && (
              (m.travelPartenzaTipo !== 'attuale' && !m.travelPartenzaNome.trim()) ||
              !m.travelDestinazioneNome.trim()
            );
            const vacationStartYmd = clampYmdNotBeforeYmd(m.travelGiornoPartenza, minSelectableYmd);
            const vacationEndYmd = clampYmdNotBeforeYmd(m.travelGiornoRitorno ?? vacationStartYmd, vacationStartYmd);
            const vacationEndTime = m.travelOrarioArrivoRitorno ?? m.travelOrarioArrivo;
            const vacationIncomplete = (type === 'new' || type === 'edit') && m.tipo === 'vacanza' && (
              !vacationStartYmd ||
              !vacationEndYmd ||
              !m.travelOrarioPartenza ||
              !vacationEndTime ||
              new Date(`${vacationEndYmd}T${vacationEndTime}:00`).getTime() <= new Date(`${vacationStartYmd}T${m.travelOrarioPartenza}:00`).getTime()
            );
            const healthIncomplete = (type === 'new' || type === 'edit') && m.tipo === 'salute' && !m.healthMetric;
            return (
              <TouchableOpacity
                onPress={() => {
                  if (travelIncomplete || vacationIncomplete || healthIncomplete) return;
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
                style={[styles.circularBtn, styles.saveBtn, (travelIncomplete || vacationIncomplete || healthIncomplete) && { opacity: 0.3 }]}
              >
                <Ionicons name="checkmark" size={52} color="#00ff00" />
              </TouchableOpacity>
            );
          })()}
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
