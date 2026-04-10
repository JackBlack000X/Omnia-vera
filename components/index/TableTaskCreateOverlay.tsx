import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppDateBounds } from '@/lib/appDateBounds';
import { clampYmdNotBeforeYmd, ymdToDate } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import type { NotificationConfig } from '@/lib/habits/schema';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import { findDuplicateHabitSlot, formatDuration, minutesToHhmm } from '@/lib/modal/helpers';
import { inferSmartTaskSeed } from '@/lib/smartTask';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const STORAGE_LABELS = 'tasks_labels_v1';
const GLASS_EFFECT = { style: 'regular', animate: true, animationDuration: 0.26 } as const;
const SHEET_CLOSE_MS = 220;
const TABLE_TASK_COLORS = ['#8B5CF6', '#22C55E', '#38BDF8', '#FB7185', '#F97316', '#FACC15', '#14B8A6', '#F472B6'];

type LabelEntry = {
  text: string;
  count: number;
};

function clampTimedRange(startMin: number, endMin: number): { start: number; end: number } {
  const clampedStart = Math.max(0, Math.min(23 * 60 + 55, Math.round(startMin / 5) * 5));
  const clampedEnd = Math.max(clampedStart + 5, Math.min(24 * 60, Math.round(endMin / 5) * 5));
  return { start: clampedStart, end: clampedEnd };
}

function minutesToDate(value: number): Date {
  const next = new Date();
  next.setHours(Math.floor(value / 60), value % 60, 0, 0);
  return next;
}

function formatClock(mins: number, locale: string): string {
  return minutesToDate(mins).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSheetDate(ymd: string, locale: string): string {
  return ymdToDate(ymd).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <GlassView
      glassEffectStyle={GLASS_EFFECT}
      colorScheme="dark"
      isInteractive
      style={[styles.card, style]}
    >
      <View pointerEvents="none" style={styles.cardOverlay} />
      {children}
    </GlassView>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

function ChoicePill({
  label,
  icon,
  selected,
  onPress,
  style,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && styles.pressed]}>
      <GlassView
        glassEffectStyle={selected ? GLASS_EFFECT : 'clear'}
        colorScheme="dark"
        isInteractive
        style={[styles.pill, selected ? styles.pillActive : styles.pillIdle]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={15}
            color={selected ? '#FFFFFF' : 'rgba(255,255,255,0.78)'}
          />
        ) : null}
        <Text style={[styles.pillText, selected && styles.pillTextActive]}>{label}</Text>
      </GlassView>
    </Pressable>
  );
}

function FieldRow({
  icon,
  title,
  value,
  expanded,
  onPress,
  accent,
  last = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  value: string;
  expanded: boolean;
  onPress: () => void;
  accent?: string;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <View style={[styles.fieldRow, !last && styles.rowDivider]}>
        <View style={[styles.leadingBubble, accent ? { backgroundColor: `${accent}22`, borderColor: `${accent}55` } : null]}>
          <Ionicons name={icon} size={17} color={accent ?? '#E5EEF9'} />
        </View>
        <View style={styles.fieldCopy}>
          <Text style={styles.fieldTitle}>{title}</Text>
          <Text style={styles.fieldValue}>{value}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color="rgba(255,255,255,0.56)"
        />
      </View>
    </Pressable>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  onInfoPress,
  last = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  onInfoPress?: () => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !last && styles.rowDivider]}>
      <View style={styles.leadingBubble}>
        <Ionicons name={icon} size={17} color="#E5EEF9" />
      </View>
      <View style={styles.toggleCopy}>
        <View style={styles.toggleTitleRow}>
          <Text style={styles.toggleTitle}>{title}</Text>
          {onInfoPress ? (
            <TouchableOpacity onPress={onInfoPress} style={styles.infoButton}>
              <Text style={styles.infoButtonText}>i</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.toggleSubtitle}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.14)', true: '#6EE7B7' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="rgba(255,255,255,0.16)"
      />
    </View>
  );
}

function NotificationCustomPicker({
  notification,
  setNotification,
}: {
  notification: NotificationConfig;
  setNotification: (value: NotificationConfig) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatLocale();
  const { nonPastYmd } = useAppDateBounds();
  const [showTime, setShowTime] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const timeDate = notification.customTime
    ? (() => {
        const [hour, minute] = notification.customTime!.split(':').map(Number);
        const next = new Date();
        next.setHours(hour, minute, 0, 0);
        return next;
      })()
    : new Date();

  const dateDate = notification.customDate
    ? ymdToDate(clampYmdNotBeforeYmd(notification.customDate, nonPastYmd))
    : ymdToDate(nonPastYmd);

  const dateLabel = notification.customDate
    ? ymdToDate(clampYmdNotBeforeYmd(notification.customDate, nonPastYmd)).toLocaleDateString(fmt, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : t('modal.anyDay');

  return (
    <View style={styles.customPickerWrap}>
      <FieldRow
        icon="time-outline"
        title={t('modal.notifTime')}
        value={notification.customTime || t('modal.setTime')}
        expanded={showTime}
        onPress={() => {
          setShowTime((current) => !current);
          setShowDate(false);
        }}
        accent="#93C5FD"
      />
      {showTime ? (
        <DateTimePicker
          value={timeDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant="dark"
          textColor="white"
          onChange={(_, date) => {
            if (!date) return;
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            setNotification({ ...notification, customTime: `${hour}:${minute}` });
          }}
          style={styles.timePickerNative}
        />
      ) : null}

      <FieldRow
        icon="calendar-outline"
        title={t('modal.notifDay')}
        value={dateLabel}
        expanded={showDate}
        onPress={() => {
          setShowDate((current) => !current);
          setShowTime(false);
        }}
        accent="#F9A8D4"
        last
      />
      {showDate ? (
        <View>
          <DateTimePicker
            value={dateDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            themeVariant="dark"
            textColor="white"
            accentColor="#93C5FD"
            minimumDate={ymdToDate(nonPastYmd)}
            onChange={(_, date) => {
              if (!date) return;
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const next = clampYmdNotBeforeYmd(`${year}-${month}-${day}`, nonPastYmd);
              setNotification({ ...notification, customDate: next });
              setShowDate(false);
            }}
          />
          <TouchableOpacity
            onPress={() => {
              setNotification({ ...notification, customDate: null });
              setShowDate(false);
            }}
            style={styles.clearInlineButton}
          >
            <Text style={styles.clearInlineButtonText}>{t('modal.removeDay')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export function TableTaskCreateOverlay({
  title,
  defaultFolder,
  defaultYmd,
  defaultTaskHasTime,
  onClose,
}: {
  title: string;
  defaultFolder?: string;
  defaultYmd: string;
  defaultTaskHasTime: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const locale = useFormatLocale();
  const insets = useSafeAreaInsets();
  const { habits, addHabit, setHabits } = useHabits();
  const { installMonthStartYmd: minSelectableYmd, nonPastYmd } = useAppDateBounds();
  const initialYmd = clampYmdNotBeforeYmd(defaultYmd, minSelectableYmd);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(defaultFolder ?? null);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [color, setColor] = useState<string>(TABLE_TASK_COLORS[1]);
  const [labelInput, setLabelInput] = useState('');
  const [savedLabels, setSavedLabels] = useState<LabelEntry[]>([]);
  const [notification, setNotification] = useState<NotificationConfig>({
    enabled: false,
    minutesBefore: 0,
    customTime: null,
    customDate: null,
    showAsTaskInOggi: false,
  });
  const [smartTaskEnabled, setSmartTaskEnabled] = useState(false);
  const [pauseDuringTravel, setPauseDuringTravel] = useState(false);
  const [askReview, setAskReview] = useState(false);
  const [taskHasTime, setTaskHasTime] = useState(defaultTaskHasTime);
  const [selectedYmd, setSelectedYmd] = useState(initialYmd);
  const [startMin, setStartMin] = useState(8 * 60);
  const [endMin, setEndMin] = useState(9 * 60);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(68);
  const sheetScale = useSharedValue(0.985);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let folderData = await AsyncStorage.getItem('tasks_custom_folders_v2');
        if (!folderData) folderData = await AsyncStorage.getItem('tasks_custom_folders_v1');
        if (!cancelled && folderData) {
          const parsed = JSON.parse(folderData);
          if (Array.isArray(parsed)) {
            const names = parsed
              .map((item: unknown) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && 'name' in item) {
                  const name = (item as { name: unknown }).name;
                  return typeof name === 'string' ? name : null;
                }
                return null;
              })
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean);
            setAvailableFolders(Array.from(new Set(names)));
          }
        }
      } catch {}

      try {
        const labelData = await AsyncStorage.getItem(STORAGE_LABELS);
        if (!cancelled && labelData) {
          const parsed = JSON.parse(labelData);
          if (Array.isArray(parsed)) setSavedLabels(parsed);
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (endMin <= startMin) setEndMin(Math.min(24 * 60, startMin + 60));
  }, [endMin, startMin]);

  useEffect(() => {
    backdropOpacity.value = withTiming(1, {
      duration: 220,
      easing: Easing.out(Easing.quad),
    });
    sheetTranslateY.value = withSpring(0, {
      damping: 22,
      stiffness: 250,
      mass: 0.9,
    });
    sheetScale.value = withTiming(1, {
      duration: 220,
      easing: Easing.out(Easing.quad),
    });

    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [backdropOpacity, sheetScale, sheetTranslateY]);

  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return;
    backdropOpacity.value = withTiming(0, {
      duration: SHEET_CLOSE_MS - 40,
      easing: Easing.inOut(Easing.quad),
    });
    sheetTranslateY.value = withTiming(74, {
      duration: SHEET_CLOSE_MS,
      easing: Easing.in(Easing.cubic),
    });
    sheetScale.value = withTiming(0.985, {
      duration: SHEET_CLOSE_MS,
      easing: Easing.inOut(Easing.quad),
    });
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, SHEET_CLOSE_MS);
  }, [backdropOpacity, onClose, sheetScale, sheetTranslateY]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: sheetTranslateY.value },
      { scale: sheetScale.value },
    ],
  }));

  const selectedDateLabel = useMemo(() => formatSheetDate(selectedYmd, locale), [locale, selectedYmd]);
  const startTimeLabel = useMemo(() => formatClock(startMin, locale), [locale, startMin]);
  const endTimeLabel = useMemo(() => formatClock(endMin, locale), [endMin, locale]);
  const dateValue = useMemo(() => ymdToDate(selectedYmd), [selectedYmd]);

  const notificationOptions = useMemo(
    () => [
      { label: t('modal.notifAtEvent'), value: 0 },
      { label: t('modal.notif5'), value: 5 },
      { label: t('modal.notif10'), value: 10 },
      { label: t('modal.notif15'), value: 15 },
      { label: t('modal.notif30'), value: 30 },
      { label: t('modal.notif60'), value: 60 },
      { label: t('modal.notif120'), value: 120 },
      { label: t('modal.notifCustomTime'), value: null },
    ],
    [t]
  );

  const topLabels = useMemo(
    () => [...savedLabels].sort((a, b) => b.count - a.count).slice(0, 3),
    [savedLabels]
  );

  const labelSuggestions = useMemo(() => {
    const query = labelInput.trim().toLowerCase();
    if (!query) return [];
    return savedLabels.filter(
      (entry) =>
        entry.text.toLowerCase().includes(query) &&
        entry.text.toLowerCase() !== query
    );
  }, [labelInput, savedLabels]);

  const handleSave = async () => {
    const lockedTitle = title.trim();
    if (!lockedTitle) return;

    const targetYmd = clampYmdNotBeforeYmd(selectedYmd, minSelectableYmd);
    const sanitizedNotification = notification.customDate
      ? { ...notification, customDate: clampYmdNotBeforeYmd(notification.customDate, nonPastYmd) }
      : notification;

    if (taskHasTime) {
      const normalizedRange = clampTimedRange(startMin, endMin);
      const start = minutesToHhmm(normalizedRange.start);
      const end = minutesToHhmm(normalizedRange.end);
      const duplicate = findDuplicateHabitSlot(habits, lockedTitle, start, end, undefined);
      if (duplicate) {
        const interval = `${start}-${end}`;
        const duplicateTitle = duplicate.habit.text?.trim().length ? duplicate.habit.text : lockedTitle;
        Alert.alert(
          t('modalLogic.duplicateSlotTitle'),
          t('modalLogic.duplicateSlotMessage', { title: duplicateTitle, interval })
        );
        return;
      }
    }

    const trimmedLabel = labelInput.trim();
    if (trimmedLabel) {
      const nextLabels = [...savedLabels];
      const existingIndex = nextLabels.findIndex(
        (entry) => entry.text.toLowerCase() === trimmedLabel.toLowerCase()
      );
      if (existingIndex >= 0) {
        nextLabels[existingIndex] = {
          ...nextLabels[existingIndex],
          count: nextLabels[existingIndex].count + 1,
        };
      } else {
        nextLabels.push({ text: trimmedLabel, count: 1 });
      }
      setSavedLabels(nextLabels);
      AsyncStorage.setItem(STORAGE_LABELS, JSON.stringify(nextLabels)).catch(() => {});
    }

    const newHabitId = addHabit(lockedTitle, color, selectedFolder || undefined, 'task', {
      habitFreq: 'single',
      ...(trimmedLabel ? { label: trimmedLabel } : {}),
    });

    const resolvedSmartTask = smartTaskEnabled
      ? inferSmartTaskSeed({
          habitFreq: 'single',
          targetYmd,
          todayYmd: initialYmd,
        })
      : null;

    setHabits((current) =>
      current.map((habit) => {
        if (habit.id !== newHabitId) return habit;

        const schedule = {
          ...(habit.schedule ?? { daysOfWeek: [] as number[] }),
          daysOfWeek: [],
          monthDays: undefined,
          yearMonth: undefined,
          yearDay: undefined,
          time: null,
          endTime: null,
          weeklyTimes: undefined,
          monthlyTimes: undefined,
          repeatEndDate: undefined,
          repeatStartDate: undefined,
        };

        const timeOverrides = taskHasTime
          ? (() => {
              const normalizedRange = clampTimedRange(startMin, endMin);
              return {
                [targetYmd]: {
                  start: minutesToHhmm(normalizedRange.start),
                  end: minutesToHhmm(normalizedRange.end),
                },
              };
            })()
          : { [targetYmd]: '00:00' as const };

        return {
          ...habit,
          text: lockedTitle,
          color,
          folder: selectedFolder || undefined,
          label: trimmedLabel || undefined,
          tipo: 'task' as const,
          isAllDay: !taskHasTime,
          habitFreq: 'single' as const,
          pauseDuringTravel,
          askReview,
          notification: sanitizedNotification,
          smartTask: resolvedSmartTask
            ? {
                enabled: smartTaskEnabled,
                intervalDays: resolvedSmartTask.intervalDays,
                nextDueDate: resolvedSmartTask.nextDueDate,
              }
            : undefined,
          schedule,
          timeOverrides,
        };
      })
    );

    requestClose();
  };

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(0,0,0,0.16)', 'rgba(4,8,20,0.48)', 'rgba(0,0,0,0.72)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={requestClose} />

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardRoot}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheetWrap, sheetAnimatedStyle]} pointerEvents="box-none">
          <SafeAreaView edges={['bottom']} style={styles.sheetSafe}>
            <GlassView
              glassEffectStyle={GLASS_EFFECT}
              colorScheme="dark"
              isInteractive
              style={styles.sheetSurface}
            >
              <BlurView
                intensity={70}
                tint="systemChromeMaterialDark"
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0.22)',
                  'rgba(255,255,255,0.08)',
                  'rgba(15,23,42,0.52)',
                ]}
                start={{ x: 0.08, y: 0 }}
                end={{ x: 0.92, y: 1 }}
                style={styles.sheetGlow}
              />

              <View style={styles.handleSlot}>
                <View style={styles.handle} />
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingBottom: Math.max(insets.bottom, 16) + 112 },
                ]}
              >
                <GlassCard style={styles.heroCard}>
                  <Text style={styles.heroOnlyTitle}>{title}</Text>
                </GlassCard>

                <SectionEyebrow>{t('modal.dateSpecificDay')}</SectionEyebrow>
                <GlassCard>
                  <FieldRow
                    icon="calendar-outline"
                    title={t('modal.dateSpecificDay')}
                    value={selectedDateLabel}
                    expanded={showDatePicker}
                    onPress={() => {
                      setShowDatePicker((current) => !current);
                      setShowStartPicker(false);
                      setShowEndPicker(false);
                    }}
                    accent="#93C5FD"
                  />
                  {showDatePicker ? (
                    <DateTimePicker
                      value={dateValue}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      themeVariant="dark"
                      textColor="white"
                      accentColor="#93C5FD"
                      minimumDate={ymdToDate(minSelectableYmd)}
                      onChange={(_, date) => {
                        if (!date) return;
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        setSelectedYmd(clampYmdNotBeforeYmd(`${year}-${month}-${day}`, minSelectableYmd));
                      }}
                    />
                  ) : null}

                  <View style={styles.inlineSection}>
                    <Text style={styles.inlineSectionTitle}>{t('modal.timeLabel')}</Text>
                    <GlassContainer spacing={10} style={styles.choiceRow}>
                      <ChoicePill
                        label={t('modal.timeNone')}
                        icon="today-outline"
                        selected={!taskHasTime}
                        onPress={() => {
                          setTaskHasTime(false);
                          setShowStartPicker(false);
                          setShowEndPicker(false);
                        }}
                        style={styles.flexChoice}
                      />
                      <ChoicePill
                        label={t('modal.timeTimed')}
                        icon="time-outline"
                        selected={taskHasTime}
                        onPress={() => setTaskHasTime(true)}
                        style={styles.flexChoice}
                      />
                    </GlassContainer>
                  </View>

                  {taskHasTime ? (
                    <>
                      <FieldRow
                        icon="play-circle-outline"
                        title={t('modal.timeStart')}
                        value={startTimeLabel}
                        expanded={showStartPicker}
                        onPress={() => {
                          setShowStartPicker((current) => !current);
                          setShowDatePicker(false);
                          setShowEndPicker(false);
                        }}
                        accent="#6EE7B7"
                      />
                      {showStartPicker ? (
                        <DateTimePicker
                          value={minutesToDate(startMin)}
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          themeVariant="dark"
                          textColor="white"
                          onChange={(_, date) => {
                            if (!date) return;
                            setStartMin(date.getHours() * 60 + date.getMinutes());
                          }}
                          style={styles.timePickerNative}
                        />
                      ) : null}

                      <FieldRow
                        icon="flag-outline"
                        title={t('modal.timeEnd')}
                        value={endTimeLabel}
                        expanded={showEndPicker}
                        onPress={() => {
                          setShowEndPicker((current) => !current);
                          setShowDatePicker(false);
                          setShowStartPicker(false);
                        }}
                        accent="#F9A8D4"
                        last
                      />
                      {showEndPicker ? (
                        <DateTimePicker
                          value={minutesToDate(endMin)}
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          themeVariant="dark"
                          textColor="white"
                          onChange={(_, date) => {
                            if (!date) return;
                            setEndMin(date.getHours() * 60 + date.getMinutes());
                          }}
                          style={styles.timePickerNative}
                        />
                      ) : null}

                      <View style={styles.durationBadge}>
                        <Ionicons name="hourglass-outline" size={14} color="#FFFFFF" />
                        <Text style={styles.durationBadgeText}>
                          {formatDuration(clampTimedRange(startMin, endMin).end - clampTimedRange(startMin, endMin).start)}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </GlassCard>

                <SectionEyebrow>{t('modal.sectionFolder')}</SectionEyebrow>
                <GlassCard>
                  <Text style={styles.groupTitle}>{t('modal.sectionFolder')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.folderRow}
                  >
                    <GlassContainer spacing={10} style={styles.folderRowInner}>
                      <ChoicePill
                        label={t('common.tutte')}
                        icon="albums-outline"
                        selected={selectedFolder === null}
                        onPress={() => setSelectedFolder(null)}
                      />
                      {availableFolders.map((folderName) => (
                        <ChoicePill
                          key={folderName}
                          label={folderName}
                          icon="folder-outline"
                          selected={selectedFolder === folderName}
                          onPress={() => setSelectedFolder(folderName)}
                        />
                      ))}
                    </GlassContainer>
                  </ScrollView>

                  <View style={styles.subGroup}>
                    <Text style={styles.groupTitle}>{t('modal.sectionLabel')}</Text>
                    <View style={styles.textFieldShell}>
                      <Ionicons name="pricetag-outline" size={16} color="rgba(255,255,255,0.5)" />
                      <TextInput
                        value={labelInput}
                        onChangeText={setLabelInput}
                        placeholder={t('modal.labelPlaceholder')}
                        placeholderTextColor="rgba(255,255,255,0.38)"
                        style={styles.textField}
                      />
                    </View>
                    {labelSuggestions.length > 0 ? (
                      <GlassContainer spacing={8} style={styles.suggestionRow}>
                        {labelSuggestions.map((entry) => (
                          <ChoicePill
                            key={entry.text}
                            label={entry.text}
                            icon="pricetag-outline"
                            selected={false}
                            onPress={() => setLabelInput(entry.text)}
                          />
                        ))}
                      </GlassContainer>
                    ) : null}
                    {labelInput.trim() === '' && topLabels.length > 0 ? (
                      <GlassContainer spacing={8} style={styles.suggestionRow}>
                        {topLabels.map((entry) => (
                          <ChoicePill
                            key={entry.text}
                            label={entry.text}
                            icon="sparkles-outline"
                            selected={false}
                            onPress={() => setLabelInput(entry.text)}
                          />
                        ))}
                      </GlassContainer>
                    ) : null}
                  </View>

                  <View style={styles.subGroup}>
                    <Text style={styles.groupTitle}>{t('modal.sectionColor')}</Text>
                    <GlassContainer spacing={12} style={styles.colorRow}>
                      {TABLE_TASK_COLORS.map((swatch) => (
                        <Pressable
                          key={swatch}
                          onPress={() => setColor(swatch)}
                          style={({ pressed }) => [pressed && styles.pressed]}
                        >
                          <GlassView
                            glassEffectStyle={color === swatch ? GLASS_EFFECT : 'clear'}
                            colorScheme="dark"
                            isInteractive
                            style={[styles.colorShell, color === swatch && styles.colorShellActive]}
                          >
                            <View style={[styles.colorCore, { backgroundColor: swatch }]} />
                            {color === swatch ? (
                              <Ionicons name="checkmark" size={14} color="#0B1220" style={styles.colorCheck} />
                            ) : null}
                          </GlassView>
                        </Pressable>
                      ))}
                    </GlassContainer>
                  </View>
                </GlassCard>

                <SectionEyebrow>{t('modal.sectionNotifications')}</SectionEyebrow>
                <GlassCard>
                  <ToggleRow
                    icon="notifications-outline"
                    title={t('modal.sectionNotifications')}
                    subtitle={taskHasTime ? startTimeLabel : selectedDateLabel}
                    value={notification.enabled}
                    onValueChange={(value) => {
                      setNotification((current) => ({ ...current, enabled: value }));
                    }}
                  />

                  {notification.enabled ? (
                    <>
                      <View style={styles.inlineSection}>
                        <Text style={styles.inlineSectionTitle}>{t('modal.sectionNotifications')}</Text>
                        <GlassContainer spacing={8} style={styles.notificationPills}>
                          {notificationOptions.map((option) => (
                            <ChoicePill
                              key={String(option.value)}
                              label={option.label}
                              selected={notification.minutesBefore === option.value}
                              onPress={() =>
                                setNotification((current) => ({
                                  ...current,
                                  enabled: true,
                                  minutesBefore: option.value,
                                  customTime: option.value !== null ? null : current.customTime,
                                }))
                              }
                            />
                          ))}
                        </GlassContainer>
                      </View>

                      {notification.minutesBefore === null ? (
                        <NotificationCustomPicker
                          notification={notification}
                          setNotification={(next) =>
                            setNotification({
                              ...next,
                              enabled: true,
                              minutesBefore: null,
                            })
                          }
                        />
                      ) : null}
                    </>
                  ) : null}
                </GlassCard>

                <SectionEyebrow>{t('modal.sectionSmartTask')}</SectionEyebrow>
                <GlassCard>
                  <ToggleRow
                    icon="sparkles-outline"
                    title={t('modal.sectionSmartTask')}
                    subtitle={t('modal.smartTaskInfoTitle')}
                    value={smartTaskEnabled}
                    onValueChange={setSmartTaskEnabled}
                    onInfoPress={() =>
                      Alert.alert(
                        t('modal.smartTaskInfoTitle'),
                        t('modal.smartTaskInfoMessage'),
                        [{ text: t('common.ok'), style: 'default', isPreferred: true }]
                      )
                    }
                  />
                  <ToggleRow
                    icon="airplane-outline"
                    title={t('modal.sectionPauseTravel')}
                    value={pauseDuringTravel}
                    onValueChange={setPauseDuringTravel}
                    onInfoPress={() =>
                      Alert.alert(
                        t('modal.pauseTravelInfoTitle'),
                        t('modal.pauseTravelInfoMessage'),
                        [{ text: t('common.ok'), style: 'default', isPreferred: true }]
                      )
                    }
                  />
                  <ToggleRow
                    icon="chatbubble-ellipses-outline"
                    title={t('modal.sectionAskReview')}
                    value={askReview}
                    onValueChange={setAskReview}
                    last
                  />
                </GlassCard>
              </ScrollView>

              <View style={[styles.footerDockWrap, { bottom: Math.max(insets.bottom, 12) }]}>
                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={styles.footerDock}
                >
                  <Pressable
                    onPress={requestClose}
                    style={({ pressed }) => [styles.footerSecondary, pressed && styles.pressed]}
                  >
                    <Text style={styles.footerSecondaryText}>{t('common.cancel')}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void handleSave()}
                    style={({ pressed }) => [styles.footerPrimaryWrap, pressed && styles.pressed]}
                  >
                    <LinearGradient
                      colors={['#B8FFDA', '#93C5FD']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.footerPrimary}
                    >
                      <Ionicons name="checkmark-circle" size={17} color="#08111F" />
                      <Text style={styles.footerPrimaryText}>{t('common.save')}</Text>
                    </LinearGradient>
                  </Pressable>
                </GlassView>
              </View>
            </GlassView>
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  sheetSafe: {
    justifyContent: 'flex-end',
  },
  sheetSurface: {
    minHeight: 460,
    maxHeight: '92%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(10,14,25,0.74)',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
    elevation: 18,
  },
  sheetGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  handleSlot: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 12,
  },
  card: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.28)',
  },
  heroCard: {
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  heroOnlyTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  sectionEyebrow: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 6,
    textTransform: 'uppercase',
  },
  pill: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillIdle: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pillText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.78,
  },
  fieldRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  leadingBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  fieldCopy: {
    flex: 1,
    gap: 3,
  },
  fieldTitle: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  inlineSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  inlineSectionTitle: {
    color: '#E5EEF9',
    fontSize: 14,
    fontWeight: '700',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flexChoice: {
    flex: 1,
  },
  timePickerNative: {
    height: 164,
    marginTop: -4,
  },
  durationBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(147,197,253,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(147,197,253,0.34)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationBadgeText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  groupTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  folderRow: {
    marginTop: 10,
  },
  folderRowInner: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 8,
  },
  subGroup: {
    marginTop: 16,
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  textFieldShell: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(3,10,20,0.3)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  textField: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorShell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  colorShellActive: {
    borderColor: 'rgba(255,255,255,0.28)',
  },
  colorCore: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  colorCheck: {
    position: 'absolute',
  },
  toggleRow: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  toggleSubtitle: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    lineHeight: 17,
  },
  infoButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  notificationPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customPickerWrap: {
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(3,10,20,0.26)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  clearInlineButton: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  clearInlineButtonText: {
    color: '#C4B5FD',
    fontSize: 13,
    fontWeight: '700',
  },
  footerDockWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  footerDock: {
    minHeight: 70,
    borderRadius: 999,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  footerSecondary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  footerSecondaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  footerPrimaryWrap: {
    flex: 1.35,
    borderRadius: 999,
    overflow: 'hidden',
  },
  footerPrimary: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  footerPrimaryText: {
    color: '#08111F',
    fontSize: 15,
    fontWeight: '800',
  },
});
